<?php

namespace App\Tests\Service\Recommend;

use App\Service\Recommend\Provider\Archidekt\ArchidektCircuitBreaker;
use PHPUnit\Framework\TestCase;

final class ArchidektCircuitBreakerTest extends TestCase
{
    private string $stateFile;

    protected function setUp(): void
    {
        $this->stateFile = sys_get_temp_dir().DIRECTORY_SEPARATOR.'archidekt_circuit_test_'.bin2hex(random_bytes(4)).'.json';
        @unlink($this->stateFile);
    }

    protected function tearDown(): void
    {
        @unlink($this->stateFile);
    }

    public function testOpensAfterConsecutiveFailuresAndFailsOpenDuringCooldown(): void
    {
        $breaker = new ArchidektCircuitBreaker($this->stateFile, failureThreshold: 3, cooldownSeconds: 3600);

        self::assertTrue($breaker->allow());
        $breaker->recordFailure();
        $breaker->recordFailure();
        self::assertTrue($breaker->allow());
        $breaker->recordFailure();

        self::assertTrue($breaker->isOpen());
        self::assertFalse($breaker->allow());
    }

    public function testSuccessResetsFailures(): void
    {
        $breaker = new ArchidektCircuitBreaker($this->stateFile, failureThreshold: 2, cooldownSeconds: 3600);
        $breaker->recordFailure();
        $breaker->recordSuccess();
        $breaker->recordFailure();

        self::assertFalse($breaker->isOpen());
        self::assertTrue($breaker->allow());
    }

    public function testCooldownExpiryAllowsProbe(): void
    {
        $breaker = new ArchidektCircuitBreaker($this->stateFile, failureThreshold: 1, cooldownSeconds: 1);
        $breaker->recordFailure();
        self::assertTrue($breaker->isOpen());

        // Force the opened_at into the past so the cool-down has elapsed.
        file_put_contents($this->stateFile, json_encode([
            'failures' => 1,
            'opened_at' => time() - 5,
            'probe' => false,
        ]));

        self::assertFalse($breaker->isOpen());
        self::assertTrue($breaker->allow());
    }
}
