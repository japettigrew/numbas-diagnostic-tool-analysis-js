<?php
declare(strict_types=1);

header('Access-Control-Allow-Origin: same-origin');

$remoteAddress = $_SERVER['REMOTE_ADDR'] ?? '';
if (!in_array($remoteAddress, ['127.0.0.1', '::1'], true)) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Local source-file access is only available from localhost.';
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Use POST.';
    exit;
}

$action = $_GET['action'] ?? '';
if ($action !== 'read-source') {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Unknown action.';
    exit;
}

$payload = json_decode((string) file_get_contents('php://input'), true);
$path = is_array($payload) ? trim((string) ($payload['path'] ?? '')) : '';
if ($path === '') {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'No source path was supplied.';
    exit;
}

$resolved = resolve_source_path($path);
if ($resolved === null) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Could not read source path:\n{$path}\n\nTried:\n" . implode("\n", source_path_candidates($path));
    exit;
}

$text = @file_get_contents($resolved);
if ($text === false) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo "The source file was found but could not be read:\n{$resolved}";
    exit;
}

header('Content-Type: text/plain; charset=utf-8');
header('X-Resolved-Source-Path: ' . rawurlencode($resolved));
echo $text;

function resolve_source_path(string $path): ?string
{
    foreach (source_path_candidates($path) as $candidate) {
        if ($candidate !== '' && is_file($candidate) && is_readable($candidate)) {
            $real = realpath($candidate);
            return $real !== false ? $real : $candidate;
        }
    }
    return null;
}

function source_path_candidates(string $path): array
{
    $path = trim($path);
    $withoutFileScheme = preg_replace('#^file:/+#i', '', $path) ?? $path;
    if (preg_match('#^[A-Za-z]:/#', $withoutFileScheme)) {
        $withoutFileScheme = $withoutFileScheme[0] . ':' . substr($withoutFileScheme, 2);
    }

    $normalised = str_replace('\\', '/', $withoutFileScheme);
    $candidates = [$path, $withoutFileScheme, $normalised];

    if (preg_match('#^//wsl(?:\$|\.localhost)/[^/]+(/.*)$#i', $normalised, $match)) {
        $candidates[] = $match[1];
    }

    if (preg_match('#^([A-Za-z]):/(.*)$#', $normalised, $match)) {
        $drive = strtolower($match[1]);
        $tail = $match[2];
        $candidates[] = "/mnt/{$drive}/{$tail}";
        $candidates[] = "{$match[1]}:/{$tail}";
        $candidates[] = "{$match[1]}:\\\\" . str_replace('/', '\\', $tail);
    }

    if (!preg_match('#^([A-Za-z]:/|//|/)#', $normalised)) {
        $candidates[] = __DIR__ . '/' . $normalised;
    }

    return array_values(array_unique(array_filter($candidates, static fn($item) => trim((string) $item) !== '')));
}
