<?php

namespace App\Service\Recommend\Provider\Archidekt;

/**
 * Host-wide fail-open circuit for Archidekt outbound traffic.
 *
 * After enough consecutive failures we stop hammering a broken (or blocking)
 * endpoint for a cool-down window. Other deck providers keep harvesting, so
 * intelligence degrades to thinner samples instead of stalling the worker.
 *
 * State lives in a flock()'d file for the same reason as the rate limiter: web
 * and messenger workers on one host must share one breaker.
 */
final class ArchidektCircuitBreaker
{
    private readonly string $stateFilePath;

    public function __construct(
        string $stateFilePath = '',
        private readonly int $failureThreshold = 5,
        private readonly int $cooldownSeconds = 3600,
    ) {
        $this->stateFilePath = '' !== $stateFilePath
            ? $stateFilePath
            : sys_get_temp_dir().DIRECTORY_SEPARATOR.'mtgstore_archidekt_circuit.json';
    }

    /** True when a request may proceed; false while the circuit is open. */
    public function allow(): bool
    {
        if ($this->failureThreshold < 1 || $this->cooldownSeconds < 1) {
            return true;
        }

        $state = $this->readState();
        $openedAt = $state['opened_at'] ?? null;
        if (null === $openedAt) {
            return true;
        }

        if ((time() - (int) $openedAt) >= $this->cooldownSeconds) {
            // Half-open: one probe is allowed; success closes, failure re-opens.
            $this->writeState(['failures' => $this->failureThreshold, 'opened_at' => null, 'probe' => true]);

            return true;
        }

        return false;
    }

    public function recordSuccess(): void
    {
        $this->writeState(['failures' => 0, 'opened_at' => null, 'probe' => false]);
    }

    public function recordFailure(): void
    {
        if ($this->failureThreshold < 1) {
            return;
        }

        $state = $this->readState();
        $failures = (int) ($state['failures'] ?? 0) + 1;
        $openedAt = $state['opened_at'] ?? null;
        if ($failures >= $this->failureThreshold) {
            $openedAt = time();
        }

        $this->writeState([
            'failures' => $failures,
            'opened_at' => $openedAt,
            'probe' => false,
        ]);
    }

    /** Peek without mutating half-open probe state. */
    public function isOpen(): bool
    {
        if ($this->failureThreshold < 1 || $this->cooldownSeconds < 1) {
            return false;
        }

        $state = $this->readState();
        $openedAt = $state['opened_at'] ?? null;
        if (null === $openedAt) {
            return false;
        }

        return (time() - (int) $openedAt) < $this->cooldownSeconds;
    }

    /**
     * @return array{failures: int, opened_at: ?int, probe: bool}
     */
    private function readState(): array
    {
        $handle = @fopen($this->stateFilePath, 'c+');
        if (false === $handle) {
            return ['failures' => 0, 'opened_at' => null, 'probe' => false];
        }

        try {
            if (!flock($handle, LOCK_SH)) {
                return ['failures' => 0, 'opened_at' => null, 'probe' => false];
            }
            rewind($handle);
            $raw = stream_get_contents($handle) ?: '';
            flock($handle, LOCK_UN);
            $decoded = json_decode($raw, true);

            return [
                'failures' => is_array($decoded) ? (int) ($decoded['failures'] ?? 0) : 0,
                'opened_at' => is_array($decoded) && isset($decoded['opened_at'])
                    ? (null === $decoded['opened_at'] ? null : (int) $decoded['opened_at'])
                    : null,
                'probe' => is_array($decoded) && !empty($decoded['probe']),
            ];
        } finally {
            fclose($handle);
        }
    }

    /**
     * @param array{failures: int, opened_at: ?int, probe?: bool} $state
     */
    private function writeState(array $state): void
    {
        $dir = dirname($this->stateFilePath);
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }

        $handle = @fopen($this->stateFilePath, 'c+');
        if (false === $handle) {
            return;
        }

        try {
            if (!flock($handle, LOCK_EX)) {
                return;
            }
            rewind($handle);
            ftruncate($handle, 0);
            fwrite($handle, json_encode([
                'failures' => max(0, (int) $state['failures']),
                'opened_at' => $state['opened_at'],
                'probe' => !empty($state['probe']),
            ], JSON_THROW_ON_ERROR));
            fflush($handle);
            flock($handle, LOCK_UN);
        } catch (\Throwable) {
            // Fail open: a broken state file must not block harvesting forever.
        } finally {
            fclose($handle);
        }
    }
}
