<?php

namespace App\Service\Customer;

/** Flat cap on how many distinct cards a shopper can watch at one store. */
final class WantListLimits
{
    public const MAX_ENTRIES = 100;

    /** Hard stop on pasted lines so a huge paste cannot fan out catalog searches. */
    public const MAX_PARSE = 200;
}
