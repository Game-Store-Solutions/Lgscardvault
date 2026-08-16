<?php

namespace App\Security;

use App\Entity\User;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Http\Authentication\AuthenticationSuccessHandlerInterface;

/**
 * Blocks a JWT from being issued until the inbox is confirmed. Wrong passwords
 * never reach this handler, so they stay a normal 401.
 */
final class AuthenticationSuccessHandler implements AuthenticationSuccessHandlerInterface
{
    public function __construct(
        private readonly AuthenticationSuccessHandlerInterface $decorated,
    ) {
    }

    public function onAuthenticationSuccess(Request $request, TokenInterface $token): Response
    {
        $user = $token->getUser();
        if ($user instanceof User && !$user->isEmailVerified()) {
            return new JsonResponse(
                [
                    'code' => Response::HTTP_FORBIDDEN,
                    'message' => 'Please verify your email before signing in.',
                    'error' => 'Please verify your email before signing in.',
                ],
                Response::HTTP_FORBIDDEN,
            );
        }

        return $this->decorated->onAuthenticationSuccess($request, $token);
    }
}
