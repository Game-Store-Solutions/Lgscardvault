<?php

namespace App\Security;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Core\Exception\CustomUserMessageAccountStatusException;
use Symfony\Component\Security\Core\Exception\TooManyLoginAttemptsAuthenticationException;
use Symfony\Component\Security\Http\Authentication\AuthenticationFailureHandlerInterface;

/**
 * Wraps Lexik's JWT authentication failure handler so login throttling surfaces
 * correctly.
 *
 * login_throttling throws TooManyLoginAttemptsAuthenticationException, but
 * Lexik's handler renders every auth failure as HTTP 401 — masking the throttle
 * as an ordinary bad-credentials response. Here we return 429 Too Many Requests
 * (with Retry-After) for the throttle case and delegate all other failures to
 * Lexik unchanged, so the JWT error format is preserved everywhere else.
 */
final class AuthenticationFailureHandler implements AuthenticationFailureHandlerInterface
{
    private const RETRY_AFTER_SECONDS = 900; // mirrors login_throttling interval (15 min)

    public function __construct(
        private readonly AuthenticationFailureHandlerInterface $decorated,
    ) {
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): Response
    {
        if ($exception instanceof TooManyLoginAttemptsAuthenticationException) {
            return new JsonResponse(
                [
                    'code' => Response::HTTP_TOO_MANY_REQUESTS,
                    'message' => 'Too many failed login attempts. Please try again later.',
                ],
                Response::HTTP_TOO_MANY_REQUESTS,
                ['Retry-After' => (string) self::RETRY_AFTER_SECONDS],
            );
        }

        if ($exception instanceof CustomUserMessageAccountStatusException) {
            return new JsonResponse(
                [
                    'code' => Response::HTTP_FORBIDDEN,
                    'message' => $exception->getMessageKey(),
                    'error' => $exception->getMessageKey(),
                ],
                Response::HTTP_FORBIDDEN,
            );
        }

        return $this->decorated->onAuthenticationFailure($request, $exception);
    }
}
