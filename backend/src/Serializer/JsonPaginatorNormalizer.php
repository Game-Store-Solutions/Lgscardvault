<?php

namespace App\Serializer;

use ApiPlatform\State\Pagination\PaginatorInterface;
use Symfony\Component\DependencyInjection\Attribute\AutoconfigureTag;
use Symfony\Component\Serializer\Normalizer\NormalizerAwareInterface;
use Symfony\Component\Serializer\Normalizer\NormalizerAwareTrait;
use Symfony\Component\Serializer\Normalizer\NormalizerInterface;

/**
 * application/json otherwise serializes a paginator as a bare array, so the
 * storefront sees 24 items and hides pagination. Keep the same envelope the
 * JSON-LD hydra collection already uses: member + totalItems.
 */
#[AutoconfigureTag('serializer.normalizer', ['priority' => 1000])]
final class JsonPaginatorNormalizer implements NormalizerInterface, NormalizerAwareInterface
{
    use NormalizerAwareTrait;

    public function supportsNormalization(mixed $data, ?string $format = null, array $context = []): bool
    {
        return 'json' === $format
            && $data instanceof PaginatorInterface
            && !isset($context['api_paginator_normalized']);
    }

    public function getSupportedTypes(?string $format): array
    {
        return 'json' === $format ? [PaginatorInterface::class => false] : [];
    }

    /**
     * @return array{member: list<mixed>, totalItems: int, page: int, itemsPerPage: int}
     */
    public function normalize(mixed $object, ?string $format = null, array $context = []): array
    {
        if (!$object instanceof PaginatorInterface) {
            return ['member' => [], 'totalItems' => 0, 'page' => 1, 'itemsPerPage' => 24];
        }

        $child = $context;
        $child['api_paginator_normalized'] = true;

        $member = [];
        foreach ($object as $item) {
            $member[] = $this->normalizer->normalize($item, $format, $child);
        }

        return [
            'member' => $member,
            'totalItems' => (int) $object->getTotalItems(),
            'page' => (int) $object->getCurrentPage(),
            'itemsPerPage' => (int) $object->getItemsPerPage(),
        ];
    }
}
