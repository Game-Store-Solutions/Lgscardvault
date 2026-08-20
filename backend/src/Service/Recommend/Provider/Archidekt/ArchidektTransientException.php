<?php

namespace App\Service\Recommend\Provider\Archidekt;

/**
 * Transient Archidekt failure (HTTP error, transport, or open circuit).
 *
 * Thrown inside cache callbacks so Symfony does not persist an empty miss for
 * the full week-long success TTL — otherwise a rate-limit burst would poison
 * the harvest cache and starve intelligence until the entries expire.
 */
final class ArchidektTransientException extends \RuntimeException
{
}
