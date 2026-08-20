<?php

namespace App\Service\Http;

/**
 * Cross-process outbound request throttle backed by an flock()'d timestamp file.
 *
 * A static property is not enough: every PHP process (web worker, each
 * messenger:consume worker, CLI commands) would get its own budget, so N
 * workers would multiply our request rate by N. Waiters queue on the exclusive
 * lock, each holder sleeps out the remaining interval and stamps the file with
 * "now", so consecutive requests across all processes on the host are spaced by
 * at least the configured interval.
 *
 * Limitation: flock() only coordinates processes on one machine. If the app is
 * scaled across hosts, swap this for a shared store (e.g. a Redis token bucket
 * via symfony/rate-limiter).
 *
 * Abstract so each outbound integration gets its own named subclass, and its own
 * independent budget, rather than sharing one throttle by accident.
 */
abstract class FileLockRateLimiter
{
    private readonly string $lockFilePath;

    public function __construct(
        string $lockFilePath,
        private readonly int $minIntervalMicroseconds,
        string $fallbackLockFileName = 'outbound_rate.lock',
    ) {
        $this->lockFilePath = '' !== $lockFilePath
            ? $lockFilePath
            : sys_get_temp_dir().DIRECTORY_SEPARATOR.$fallbackLockFileName;
    }

    /**
     * Blocks until this process may issue the next request.
     *
     * Fails open (no throttling) when the lock file cannot be used, since a
     * missed throttle only risks a 429 that callers already tolerate.
     */
    public function acquire(): void
    {
        $dir = dirname($this->lockFilePath);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }

        $handle = @fopen($this->lockFilePath, 'c+');
        if (false === $handle) {
            return;
        }

        try {
            if (!flock($handle, LOCK_EX)) {
                return;
            }

            rewind($handle);
            $last = (float) stream_get_contents($handle);

            $now = microtime(true);
            $nextAllowed = $last + $this->minIntervalMicroseconds / 1_000_000;
            if ($now < $nextAllowed) {
                usleep((int) ceil(($nextAllowed - $now) * 1_000_000));
                $now = microtime(true);
            }

            rewind($handle);
            ftruncate($handle, 0);
            fwrite($handle, sprintf('%.6F', $now));
            fflush($handle);
            flock($handle, LOCK_UN);
        } finally {
            fclose($handle);
        }
    }
}
