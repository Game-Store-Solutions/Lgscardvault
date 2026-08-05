<?php

declare(strict_types=1);

$pass = '';
foreach (file(__DIR__ . '/../.env') as $line) {
    if (str_starts_with($line, 'JWT_PASSPHRASE=')) {
        $pass = trim(substr($line, strlen('JWT_PASSPHRASE=')));
        break;
    }
}

$dir = __DIR__ . '/../config/jwt';
if (!is_dir($dir)) {
    mkdir($dir, 0777, true);
}

$key = openssl_pkey_new([
    'private_key_bits' => 4096,
    'private_key_type' => OPENSSL_KEYTYPE_RSA,
]);
if (false === $key) {
    fwrite(STDERR, (openssl_error_string() ?: 'openssl_pkey_new failed') . PHP_EOL);
    exit(1);
}

$priv = '';
if (!openssl_pkey_export($key, $priv, $pass)) {
    fwrite(STDERR, (openssl_error_string() ?: 'export failed') . PHP_EOL);
    exit(1);
}

$pub = openssl_pkey_get_details($key)['key'] ?? '';
if ('' === $pub) {
    fwrite(STDERR, "public key missing\n");
    exit(1);
}

file_put_contents($dir . '/private.pem', $priv);
file_put_contents($dir . '/public.pem', $pub);
echo "JWT keys written to config/jwt/\n";
