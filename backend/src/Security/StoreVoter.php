<?php

namespace App\Security;

use App\Entity\Store;
use App\Entity\StoreStaff;
use App\Entity\User;
use App\Repository\StoreStaffRepository;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Authorization\Voter\Vote;
use Symfony\Component\Security\Core\Authorization\Voter\Voter;

/** @extends Voter<string, Store|null> */
class StoreVoter extends Voter
{
    public const MANAGE = 'STORE_MANAGE';
    public const OWN = 'STORE_OWN';

    public function __construct(
        private readonly StoreStaffRepository $staff,
    ) {
    }

    protected function supports(string $attribute, mixed $subject): bool
    {
        return in_array($attribute, [self::MANAGE, self::OWN], true)
            && ($subject instanceof Store || null === $subject);
    }

    protected function voteOnAttribute(string $attribute, mixed $subject, TokenInterface $token, ?Vote $vote = null): bool
    {
        $user = $token->getUser();
        if (!$user instanceof User) {
            return false;
        }

        if (in_array('ROLE_SUPER_ADMIN', $user->getRoles(), true)) {
            return true;
        }

        if (!$subject instanceof Store) {
            return false;
        }

        if ($subject->isOwnedBy($user)) {
            return true;
        }

        if (self::OWN === $attribute) {
            return false;
        }

        $membership = $this->staff->findOneFor($subject, $user);

        return $membership instanceof StoreStaff && $membership->isAdmin();
    }
}
