<?php
/**
 * LiveChat JSON Storage Receiver
 * Upload this file to your PHP hosting (e.g. livechat_api.php)
 * Stores chat messages into messages.json with file locking.
 */

// 1. Set Headers & Enable CORS
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 2. Data file path
$dataFile = __DIR__ . '/messages.json';

// Initialize data file if it doesn't exist
if (!file_exists($dataFile)) {
    file_put_contents($dataFile, json_encode([], JSON_PRETTY_PRINT));
    @chmod($dataFile, 0666);
}

// Protect messages.json from direct browser access via .htaccess if on Apache
$htaccessFile = __DIR__ . '/.htaccess';
if (!file_exists($htaccessFile)) {
    @file_put_contents($htaccessFile, "<Files \"messages.json\">\nOrder Allow,Deny\nDeny from all\n</Files>\n");
}

// Helper: Read messages with shared lock
function readAllMessages($file) {
    if (!file_exists($file)) return [];
    $fp = fopen($file, 'r');
    if (!$fp) return [];
    flock($fp, LOCK_SH);
    $size = filesize($file);
    $content = $size > 0 ? fread($fp, $size) : '[]';
    flock($fp, LOCK_UN);
    fclose($fp);
    $data = json_decode($content, true);
    return is_array($data) ? $data : [];
}

// Helper: Append a message with exclusive lock
function appendMessage($file, $newMsg) {
    $fp = fopen($file, 'c+');
    if (!$fp) return false;

    if (flock($fp, LOCK_EX)) {
        $size = filesize($file);
        $content = $size > 0 ? fread($fp, $size) : '[]';
        $messages = json_decode($content, true);
        if (!is_array($messages)) {
            $messages = [];
        }

        // Auto-increment ID
        $lastId = 0;
        if (!empty($messages)) {
            $lastItem = end($messages);
            $lastId = isset($lastItem['id']) ? (int)$lastItem['id'] : count($messages);
        }
        $newMsg['id'] = $lastId + 1;
        if (empty($newMsg['created_at'])) {
            $newMsg['created_at'] = gmdate('Y-m-d H:i:s');
        }

        $newMsg['seen'] = isset($newMsg['seen']) ? (bool)$newMsg['seen'] : false;

        $messages[] = $newMsg;

        // Truncate and write updated JSON
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, json_encode($messages, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        return $newMsg;
    }

    fclose($fp);
    return false;
}

// Helper: Mark messages as seen with exclusive lock
function markMessagesAsSeen($file, $sender = null, $recipient = null, $ids = []) {
    if (!file_exists($file)) return 0;
    $fp = fopen($file, 'c+');
    if (!$fp) return 0;

    $updatedCount = 0;
    if (flock($fp, LOCK_EX)) {
        $size = filesize($file);
        $content = $size > 0 ? fread($fp, $size) : '[]';
        $messages = json_decode($content, true);
        if (is_array($messages)) {
            $now = gmdate('Y-m-d H:i:s');
            $idSet = null;
            if (!empty($ids)) {
                $flatIds = is_array($ids) ? $ids : explode(',', (string)$ids);
                $idSet = array_flip(array_map('strval', $flatIds));
            }

            foreach ($messages as &$msg) {
                $mId = isset($msg['id']) ? (string)$msg['id'] : '';
                $mSender = isset($msg['sender']) ? $msg['sender'] : '';
                $mRecipient = isset($msg['recipient']) ? $msg['recipient'] : '';

                $match = false;
                if ($idSet !== null && $mId !== '' && isset($idSet[$mId])) {
                    $match = true;
                } elseif ($sender && $recipient) {
                    if ($mSender === $sender && $mRecipient === $recipient) {
                        $match = true;
                    }
                } elseif ($recipient && !$sender) {
                    if ($mRecipient === $recipient) {
                        $match = true;
                    }
                } elseif ($idSet === null && !$sender && !$recipient) {
                    $match = true;
                }

                if ($match && empty($msg['seen'])) {
                    $msg['seen'] = true;
                    $msg['seen_at'] = $now;
                    $updatedCount++;
                }
            }
            unset($msg);

            if ($updatedCount > 0) {
                ftruncate($fp, 0);
                rewind($fp);
                fwrite($fp, json_encode($messages, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
                fflush($fp);
            }
        }
        flock($fp, LOCK_UN);
    }
    fclose($fp);
    return $updatedCount;
}

// Helper: Save base64 voice note to audio file in /voice/ directory
function saveVoiceAudioFile($dataUrlOrBase64) {
    if (empty($dataUrlOrBase64)) return null;

    $ext = 'webm';
    $binary = null;

    // Check if Data URL: data:audio/webm;codecs=opus;base64,... or data:audio/mp4;base64,...
    if (preg_match('/^data:audio\/([a-zA-Z0-9_\-\+]+)(?:;[a-zA-Z0-9_\-=]+)*;base64,(.+)$/s', $dataUrlOrBase64, $matches)) {
        $mime = strtolower($matches[1]);
        if (strpos($mime, 'ogg') !== false) {
            $ext = 'ogg';
        } elseif (strpos($mime, 'mp4') !== false || strpos($mime, 'm4a') !== false || strpos($mime, 'aac') !== false) {
            $ext = 'm4a';
        } elseif (strpos($mime, 'wav') !== false) {
            $ext = 'wav';
        } elseif (strpos($mime, 'mp3') !== false || strpos($mime, 'mpeg') !== false) {
            $ext = 'mp3';
        } else {
            $ext = 'webm';
        }
        $binary = base64_decode($matches[2]);
    } else {
        // Raw base64 string
        $decoded = base64_decode($dataUrlOrBase64, true);
        if ($decoded !== false && strlen($decoded) > 50) {
            $binary = $decoded;
            $ext = 'webm';
        }
    }

    if (!$binary) {
        // If it's already a URL or cannot be decoded as base64, return as-is
        return $dataUrlOrBase64;
    }

    $voiceDir = __DIR__ . '/voice';
    if (!is_dir($voiceDir)) {
        @mkdir($voiceDir, 0755, true);
    }

    // Generate unique safe file name
    $fileName = 'voice_' . time() . '_' . substr(md5(uniqid(mt_rand(), true)), 0, 8) . '.' . $ext;
    $filePath = $voiceDir . '/' . $fileName;

    if (@file_put_contents($filePath, $binary) !== false) {
        // Determine base URL dynamically
        $isHttps = (
            (!empty($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) !== 'off') ||
            (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') ||
            (!empty($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443)
        );
        $scheme = $isHttps ? 'https' : 'http';
        $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : (isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : '');
        $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');

        if ($host) {
            return "{$scheme}://{$host}{$scriptDir}/voice/{$fileName}";
        }
    }

    // If writing file failed (e.g. read-only host), return original string to persist in JSON
    return $dataUrlOrBase64;
}

// Helper: Save base64 image to image file in /images/ directory
function saveImageFile($dataUrlOrBase64) {
    if (empty($dataUrlOrBase64)) return null;

    $ext = 'jpg';
    $binary = null;

    // Check if Data URL: data:image/(jpeg|png|webp|gif|svg+xml);base64,...
    if (preg_match('/^data:image\/([a-zA-Z0-9_\-\+]+)(?:;[a-zA-Z0-9_\-=]+)*;base64,(.+)$/s', $dataUrlOrBase64, $matches)) {
        $mime = strtolower($matches[1]);
        if (strpos($mime, 'png') !== false) {
            $ext = 'png';
        } elseif (strpos($mime, 'webp') !== false) {
            $ext = 'webp';
        } elseif (strpos($mime, 'gif') !== false) {
            $ext = 'gif';
        } elseif (strpos($mime, 'svg') !== false) {
            $ext = 'svg';
        } else {
            $ext = 'jpg';
        }
        $binary = base64_decode($matches[2]);
    } else {
        // Raw base64 string
        $decoded = base64_decode($dataUrlOrBase64, true);
        if ($decoded !== false && strlen($decoded) > 50) {
            $binary = $decoded;
            $ext = 'jpg';
        }
    }

    if (!$binary) {
        // If it's already a URL or cannot be decoded as base64, return as-is
        return $dataUrlOrBase64;
    }

    $imagesDir = __DIR__ . '/images';
    if (!is_dir($imagesDir)) {
        @mkdir($imagesDir, 0755, true);
    }

    // Generate unique safe file name
    $fileName = 'img_' . time() . '_' . substr(md5(uniqid(mt_rand(), true)), 0, 8) . '.' . $ext;
    $filePath = $imagesDir . '/' . $fileName;

    if (@file_put_contents($filePath, $binary) !== false) {
        // Determine base URL dynamically
        $isHttps = (
            (!empty($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) !== 'off') ||
            (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https') ||
            (!empty($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443)
        );
        $scheme = $isHttps ? 'https' : 'http';
        $host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : (isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : '');
        $scriptDir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/');

        if ($host) {
            return "{$scheme}://{$host}{$scriptDir}/images/{$fileName}";
        }
    }

    // If writing file failed (e.g. read-only host), return original string to persist in JSON
    return $dataUrlOrBase64;
}

// Determine Action and Method
$method = $_SERVER['REQUEST_METHOD'];
$action = isset($_GET['action']) ? strtolower(trim($_GET['action'])) : '';

$rawInput = file_get_contents('php://input');
$jsonBody = json_decode($rawInput, true);

if (!$action && is_array($jsonBody) && isset($jsonBody['action'])) {
    $action = strtolower(trim($jsonBody['action']));
}
if (!$action && isset($_POST['action'])) {
    $action = strtolower(trim($_POST['action']));
}

// ─────────────────────────────────────────────────────────────
// 0. CLEAR: Empty messages.json and clean voice files
// Example: ?action=clear or ?action=empty or POST {"action":"clear"}
// ─────────────────────────────────────────────────────────────
if ($action === 'clear' || $action === 'empty') {
    $fp = fopen($dataFile, 'w');
    if ($fp) {
        flock($fp, LOCK_EX);
        fwrite($fp, json_encode([], JSON_PRETTY_PRINT));
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);

        // Also clean up any saved voice and image files
        $voiceDir = __DIR__ . '/voice';
        if (is_dir($voiceDir)) {
            $files = glob($voiceDir . '/*');
            if (is_array($files)) {
                foreach ($files as $f) {
                    if (is_file($f)) @unlink($f);
                }
            }
        }
        $imagesDir = __DIR__ . '/images';
        if (is_dir($imagesDir)) {
            $files = glob($imagesDir . '/*');
            if (is_array($files)) {
                foreach ($files as $f) {
                    if (is_file($f)) @unlink($f);
                }
            }
        }

        echo json_encode([
            'status' => 'ok',
            'message' => 'All messages, voice notes, and images cleared successfully'
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit;
    }
}

// ─────────────────────────────────────────────────────────────
// 1. GET: Retrieve messages
// Example: ?action=get&user1=jisu&user2=jenu
// ─────────────────────────────────────────────────────────────
if ($method === 'GET' || $action === 'get') {
    $user1 = isset($_GET['user1']) ? trim($_GET['user1']) : (isset($_GET['user']) ? trim($_GET['user']) : '');
    $user2 = isset($_GET['user2']) ? trim($_GET['user2']) : (isset($_GET['opponent']) ? trim($_GET['opponent']) : '');

    $allMessages = readAllMessages($dataFile);

    // Filter messages for the conversation if user1 & user2 provided
    if ($user1 && $user2) {
        $conversation = array_values(array_filter($allMessages, function ($m) use ($user1, $user2) {
            $s = isset($m['sender']) ? $m['sender'] : '';
            $r = isset($m['recipient']) ? $m['recipient'] : '';
            return ($s === $user1 && $r === $user2) || ($s === $user2 && $r === $user1);
        }));
    } else {
        // Return all messages if no specific user pair
        $conversation = $allMessages;
    }

    // Ensure seen status exists on every message
    $totalCount = count($conversation);
    for ($i = 0; $i < $totalCount; $i++) {
        if (!isset($conversation[$i]['seen'])) {
            $s = isset($conversation[$i]['sender']) ? $conversation[$i]['sender'] : '';
            $r = isset($conversation[$i]['recipient']) ? $conversation[$i]['recipient'] : '';
            $hasReplyAfter = false;
            for ($j = $i + 1; $j < $totalCount; $j++) {
                if (isset($conversation[$j]['sender']) && $conversation[$j]['sender'] === $r) {
                    $hasReplyAfter = true;
                    break;
                }
            }
            $conversation[$i]['seen'] = $hasReplyAfter;
        } else {
            $conversation[$i]['seen'] = (bool)$conversation[$i]['seen'];
        }
    }

    echo json_encode([
        'status' => 'ok',
        'count' => count($conversation),
        'messages' => $conversation
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// ─────────────────────────────────────────────────────────────
// 2. SEEN: Mark message(s) as seen
// Example: POST or GET ?action=seen&sender=jisu&recipient=jenu
// or POST {"action":"seen","sender":"jisu","recipient":"jenu","ids":[1,2,3]}
// ─────────────────────────────────────────────────────────────
if ($action === 'seen' || $action === 'mark_seen') {
    $input = is_array($jsonBody) ? $jsonBody : $_POST;

    $sender = isset($input['sender']) ? trim($input['sender']) : (isset($_GET['sender']) ? trim($_GET['sender']) : '');
    $recipient = isset($input['recipient']) ? trim($input['recipient']) : (isset($_GET['recipient']) ? trim($_GET['recipient']) : '');
    $ids = isset($input['ids']) ? $input['ids'] : (isset($_GET['ids']) ? explode(',', $_GET['ids']) : []);
    if (isset($input['id']) && $input['id'] !== '') $ids[] = $input['id'];
    if (isset($_GET['id']) && $_GET['id'] !== '') $ids[] = $_GET['id'];

    $updatedCount = markMessagesAsSeen($dataFile, $sender, $recipient, $ids);

    echo json_encode([
        'status' => 'ok',
        'message' => "Marked {$updatedCount} messages as seen",
        'updated' => $updatedCount
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    exit;
}

// ─────────────────────────────────────────────────────────────
// 3. POST: Save a new message (chat or voice)
// Example: POST JSON body:
// {"sender":"jisu","recipient":"jenu","msg_type":"chat","text_content":"hello","client_time":"10:30 AM"}
// or for voice:
// {"sender":"jisu","recipient":"jenu","msg_type":"voice","text_content":"data:audio/webm;base64,...","media_duration":4.5}
// ─────────────────────────────────────────────────────────────
if ($method === 'POST') {
    $input = is_array($jsonBody) ? $jsonBody : $_POST;

    $sender = isset($input['sender']) ? trim($input['sender']) : '';
    $recipient = isset($input['recipient']) ? trim($input['recipient']) : '';
    $msgType = isset($input['msg_type']) ? trim($input['msg_type']) : 'chat';
    $textContent = isset($input['text_content']) ? $input['text_content'] : (isset($input['text']) ? $input['text'] : (isset($input['audio']) ? $input['audio'] : null));
    $mediaDuration = isset($input['media_duration']) ? (float)$input['media_duration'] : (isset($input['duration']) ? (float)$input['duration'] : null);
    $clientTime = isset($input['client_time']) ? trim($input['client_time']) : (isset($input['time']) ? trim($input['time']) : '');
    $seen = isset($input['seen']) ? (bool)$input['seen'] : false;

    if (!$sender || !$recipient) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Missing sender or recipient']);
        exit;
    }

    // For voice messages: save audio binary to /voice/ folder and convert to static URL
    if ($msgType === 'voice' && !empty($textContent)) {
        $textContent = saveVoiceAudioFile($textContent);
    }
    // For image messages: save image binary to /images/ folder and convert to static URL
    if ($msgType === 'image' && !empty($textContent)) {
        $textContent = saveImageFile($textContent);
    }

    $newRecord = [
        'sender' => $sender,
        'recipient' => $recipient,
        'msg_type' => $msgType,
        'text_content' => $textContent,
        'media_duration' => $mediaDuration,
        'client_time' => $clientTime,
        'seen' => $seen,
    ];

    $saved = appendMessage($dataFile, $newRecord);

    if ($saved) {
        echo json_encode([
            'status' => 'ok',
            'message' => 'Message saved successfully',
            'data' => $saved
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    } else {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Could not save message']);
    }
    exit;
}

// Default fallback
echo json_encode([
    'status' => 'ok',
    'service' => 'LiveChat PHP JSON Storage Receiver',
    'endpoints' => [
        'get_messages' => 'GET ?action=get&user1=jisu&user2=jenu',
        'mark_seen' => 'POST or GET ?action=seen&sender=jisu&recipient=jenu',
        'save_message' => 'POST with JSON body {sender, recipient, msg_type, text_content, client_time}'
    ]
]);
