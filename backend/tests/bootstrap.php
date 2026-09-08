<?php

use Symfony\Component\Dotenv\Dotenv;

require dirname(__DIR__).'/vendor/autoload.php';

if (method_exists(Dotenv::class, 'bootEnv')) {
    (new Dotenv())->bootEnv(dirname(__DIR__).'/.env');
}

// Platform PayPal SaaS must stay offline in the suite. Developer `.env.local`
// keys can otherwise leak in and make Connect hit the real sandbox (500).
if ('test' === ($_SERVER['APP_ENV'] ?? $_ENV['APP_ENV'] ?? '')) {
    foreach ([
        'PAYPAL_SANDBOX_CLIENT_ID',
        'PAYPAL_SANDBOX_CLIENT_SECRET',
        'PAYPAL_LIVE_CLIENT_ID',
        'PAYPAL_LIVE_CLIENT_SECRET',
    ] as $key) {
        $_ENV[$key] = '';
        $_SERVER[$key] = '';
        putenv($key.'=');
    }
}

if ($_SERVER['APP_DEBUG']) {
    umask(0000);
}
