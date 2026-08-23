<?php

namespace App\Controller;

use App\Service\Legal\LegalSiteInfo;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/legal')]
final class LegalController extends AbstractController
{
    public function __construct(private readonly LegalSiteInfo $legalSiteInfo)
    {
    }

    #[Route('/site', name: 'api_legal_site', methods: ['GET'])]
    public function site(): JsonResponse
    {
        return $this->json($this->legalSiteInfo->toArray());
    }
}
