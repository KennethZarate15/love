<?php
// Simple gallery API for uploads, listing, updates, and deletions
// Stores files under ../images/uploads and metadata in meta.json
header('Content-Type: application/json');

$baseDir = realpath(__DIR__ . '/../images/uploads');
if ($baseDir === false) {
    $baseParent = realpath(__DIR__ . '/../images');
    if ($baseParent === false) {
        @mkdir(__DIR__ . '/../images', 0775, true);
        $baseParent = realpath(__DIR__ . '/../images');
    }
    @mkdir(__DIR__ . '/../images/uploads', 0775, true);
    $baseDir = realpath(__DIR__ . '/../images/uploads');
}

$metaFile = $baseDir . DIRECTORY_SEPARATOR . 'meta.json';
if (!file_exists($metaFile)) {
    @file_put_contents($metaFile, json_encode(new stdClass(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
}

function read_meta($metaFile) {
    $data = @file_get_contents($metaFile);
    if ($data === false || $data === '') return [];
    $json = json_decode($data, true);
    if (!is_array($json)) return [];
    return $json;
}

function write_meta($metaFile, $meta) {
    $tmp = $metaFile . '.tmp';
    $ok = @file_put_contents($tmp, json_encode($meta, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
    if ($ok === false) return false;
    return @rename($tmp, $metaFile);
}

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function sanitize_filename($name) {
    $name = preg_replace('/[^A-Za-z0-9._-]/', '_', $name);
    // prevent hidden dotfiles
    $name = ltrim($name, '.');
    return $name ?: ('file_' . uniqid());
}

function allowed_ext($ext) {
    $ext = strtolower($ext);
    return in_array($ext, ['jpg','jpeg','png','gif','webp']);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? ($_POST['action'] ?? null);

if ($method === 'GET' && ($action === null || $action === 'list')) {
    $meta = read_meta($metaFile);
    $items = [];
    foreach ($meta as $id => $m) {
        $file = $m['file'] ?? '';
        if (!$file) continue;
        $path = $GLOBALS['baseDir'] . DIRECTORY_SEPARATOR . $file;
        if (!file_exists($path)) continue; // skip missing
        $items[] = [
            'id' => $id,
            'src' => 'images/uploads/' . $file,
            'alt' => $m['alt'] ?? '',
            'captionText' => $m['captionText'] ?? '',
            'tag' => $m['tag'] ?? 'nature',
            'createdAt' => $m['createdAt'] ?? (filemtime($path) * 1000),
        ];
    }
    // newest first
    usort($items, function($a,$b){ return ($b['createdAt']??0) <=> ($a['createdAt']??0); });
    respond(['ok' => true, 'items' => $items]);
}

if ($method === 'POST' && $action === 'upload') {
    if (!isset($_FILES) || !$_FILES) respond(['ok' => false, 'error' => 'No files'], 400);

    $tag = $_POST['tag'] ?? 'nature';
    $caption = $_POST['captionText'] ?? '';
    $alt = $_POST['alt'] ?? '';

    $meta = read_meta($metaFile);
    $out = [];

    // Support both single 'file' and multiple 'files[]'
    $files = [];
    if (isset($_FILES['file'])) $files['file'] = $_FILES['file'];
    if (isset($_FILES['files'])) $files = $_FILES['files'];

    // Normalize loop
    if (isset($files['name']) && is_array($files['name'])) {
        $count = count($files['name']);
        for ($i=0; $i<$count; $i++) {
            $single = [
                'name' => $files['name'][$i],
                'type' => $files['type'][$i],
                'tmp_name' => $files['tmp_name'][$i],
                'error' => $files['error'][$i],
                'size' => $files['size'][$i],
            ];
            $processed = process_upload($single, $tag, $caption, $alt, $meta);
            if ($processed) $out[] = $processed;
        }
    } else {
        $processed = process_upload($files['file'] ?? null, $tag, $caption, $alt, $meta);
        if ($processed) $out[] = $processed;
    }

    write_meta($metaFile, $meta);
    respond(['ok' => true, 'items' => $out]);
}

function process_upload($file, $tag, $caption, $alt, &$meta) {
    if (!$file || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) return null;
    $original = sanitize_filename($file['name'] ?? 'image');
    $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
    if (!allowed_ext($ext)) return null;

    $id = uniqid('img_', true);
    $filename = $id . '.' . $ext;
    $target = $GLOBALS['baseDir'] . DIRECTORY_SEPARATOR . $filename;

    if (!@move_uploaded_file($file['tmp_name'], $target)) return null;

    $item = [
        'id' => $id,
        'file' => $filename,
        'alt' => $alt ?: preg_replace('/\.[^.]+$/', '', $original),
        'captionText' => $caption ?: ('New memory — ' . preg_replace('/\.[^.]+$/', '', $original)),
        'tag' => $tag ?: 'nature',
        'createdAt' => round(microtime(true) * 1000),
    ];
    $meta[$id] = $item;

    return [
        'id' => $id,
        'src' => 'images/uploads/' . $filename,
        'alt' => $item['alt'],
        'captionText' => $item['captionText'],
        'tag' => $item['tag'],
        'createdAt' => $item['createdAt'],
    ];
}

if ($method === 'POST' && $action === 'update') {
    $body = json_decode(file_get_contents('php://input'), true);
    $id = $body['id'] ?? null;
    if (!$id) respond(['ok' => false, 'error' => 'Missing id'], 400);

    $meta = read_meta($metaFile);
    if (!isset($meta[$id])) respond(['ok' => false, 'error' => 'Not found'], 404);

    if (isset($body['captionText'])) $meta[$id]['captionText'] = (string)$body['captionText'];
    if (isset($body['tag'])) $meta[$id]['tag'] = (string)$body['tag'];
    if (isset($body['alt'])) $meta[$id]['alt'] = (string)$body['alt'];

    write_meta($metaFile, $meta);

    $file = $meta[$id]['file'];
    respond(['ok' => true, 'item' => [
        'id' => $id,
        'src' => 'images/uploads/' . $file,
        'alt' => $meta[$id]['alt'] ?? '',
        'captionText' => $meta[$id]['captionText'] ?? '',
        'tag' => $meta[$id]['tag'] ?? 'nature',
        'createdAt' => $meta[$id]['createdAt'] ?? 0,
    ]]);
}

if ($method === 'POST' && $action === 'delete') {
    $body = json_decode(file_get_contents('php://input'), true);
    $id = $body['id'] ?? null;
    if (!$id) respond(['ok' => false, 'error' => 'Missing id'], 400);

    $meta = read_meta($metaFile);
    if (!isset($meta[$id])) respond(['ok' => false, 'error' => 'Not found'], 404);

    $file = $meta[$id]['file'] ?? null;
    if ($file) {
        $path = $GLOBALS['baseDir'] . DIRECTORY_SEPARATOR . $file;
        if (file_exists($path)) @unlink($path);
    }

    unset($meta[$id]);
    write_meta($metaFile, $meta);

    respond(['ok' => true]);
}

respond(['ok' => false, 'error' => 'Unsupported route'], 404);
