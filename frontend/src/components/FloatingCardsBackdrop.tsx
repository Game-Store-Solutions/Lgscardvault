import { cx } from '../lib/cx'

export type FloatCard = {
  src: string
  alt: string
  className: string
  delay: string
}

/** Shared TCG art set for marketing surfaces (landing, marketplace hero, auth). */
export const FLOAT_CARDS: FloatCard[] = [
  {
    src: '/brand/cards/mtg-teferi.jpg',
    alt: 'Magic: The Gathering — Teferi, Hero of Dominaria',
    className: 'left-[2%] top-[10%] w-[22%] max-w-[9.5rem] -rotate-12 sm:left-[4%] sm:w-[16%]',
    delay: '0s',
  },
  {
    src: '/brand/cards/op-luffy.jpg',
    alt: 'One Piece Card Game — Monkey D. Luffy',
    className: 'right-[2%] top-[6%] w-[24%] max-w-[10rem] rotate-8 sm:right-[4%] sm:w-[17%]',
    delay: '0.25s',
  },
  {
    src: '/brand/cards/pkm-charizard.jpg',
    alt: 'Pokémon — Charizard',
    className: 'left-[26%] top-[3%] hidden w-[14%] max-w-[8rem] rotate-3 sm:block',
    delay: '0.1s',
  },
  {
    src: '/brand/cards/fab-bravo.jpg',
    alt: 'Flesh and Blood — Bravo',
    className: 'bottom-[8%] left-[3%] w-[20%] max-w-[9rem] rotate-6 sm:left-[6%] sm:w-[15%]',
    delay: '0.55s',
  },
  {
    src: '/brand/cards/mtg-ragavan.jpg',
    alt: 'Magic: The Gathering — Ragavan, Nimble Pilferer',
    className: 'bottom-[5%] right-[3%] w-[22%] max-w-[9.5rem] -rotate-6 sm:right-[6%] sm:w-[16%]',
    delay: '0.8s',
  },
  {
    src: '/brand/cards/pkm-pikachu.jpg',
    alt: 'Pokémon — Pikachu',
    className: 'right-[26%] top-[7%] hidden w-[13%] max-w-[7.5rem] -rotate-4 md:block',
    delay: '0.4s',
  },
  {
    src: '/brand/cards/op-zoro.jpg',
    alt: 'One Piece Card Game — Roronoa Zoro',
    className: 'left-[38%] bottom-[2%] hidden w-[13%] max-w-[7.5rem] rotate-2 lg:block',
    delay: '1.0s',
  },
  {
    src: '/brand/cards/fab-dorinthea.jpg',
    alt: 'Flesh and Blood — Dorinthea',
    className: 'right-[34%] bottom-[5%] hidden w-[13%] max-w-[7.5rem] -rotate-3 md:block',
    delay: '1.15s',
  },
  {
    src: '/brand/cards/pkm-mewtwo.jpg',
    alt: 'Pokémon — Mewtwo',
    className: 'left-[12%] bottom-[26%] hidden w-[12%] max-w-[7rem] -rotate-8 xl:block',
    delay: '0.7s',
  },
  {
    src: '/brand/cards/fab-lexi.jpg',
    alt: 'Flesh and Blood — Lexi',
    className: 'right-[10%] top-[34%] hidden w-[12%] max-w-[7rem] rotate-10 xl:block',
    delay: '1.3s',
  },
  {
    src: '/brand/cards/pkm-blastoise.jpg',
    alt: 'Pokémon — Blastoise',
    className: 'left-[46%] top-[10%] hidden w-[11%] max-w-[6.5rem] rotate-6 xl:block',
    delay: '0.2s',
  },
  {
    src: '/brand/cards/mtg-sheoldred.jpg',
    alt: 'Magic: The Gathering — Sheoldred, the Apocalypse',
    className: 'left-[8%] top-[36%] hidden w-[12%] max-w-[7rem] rotate-[-14deg] lg:block',
    delay: '1.45s',
  },
  {
    src: '/brand/cards/op-nami.jpg',
    alt: 'One Piece Card Game — Nami',
    className: 'right-[20%] bottom-[28%] hidden w-[12%] max-w-[7rem] rotate-[9deg] lg:block',
    delay: '1.6s',
  },
  {
    src: '/brand/cards/mtg-lotus.jpg',
    alt: 'Magic: The Gathering — Black Lotus',
    className: 'left-[58%] bottom-[12%] hidden w-[11%] max-w-[6.5rem] rotate-[-5deg] xl:block',
    delay: '0.95s',
  },
  {
    src: '/brand/cards/pkm-venusaur.jpg',
    alt: 'Pokémon — Venusaur',
    className: 'right-[48%] top-[28%] hidden w-[11%] max-w-[6.5rem] rotate-[7deg] xl:block',
    delay: '1.75s',
  },
  {
    src: '/brand/cards/mtg-solring.jpg',
    alt: 'Magic: The Gathering — Sol Ring',
    className: 'left-[22%] top-[48%] hidden w-[11%] max-w-[6.5rem] rotate-[11deg] xl:block',
    delay: '1.9s',
  },
  {
    src: '/brand/cards/op-sanji.jpg',
    alt: 'One Piece Card Game — Sanji',
    className: 'right-[58%] bottom-[8%] hidden w-[11%] max-w-[6.5rem] rotate-[-9deg] xl:block',
    delay: '2.05s',
  },
  {
    src: '/brand/cards/pkm-gyarados.jpg',
    alt: 'Pokémon — Gyarados',
    className: 'left-[70%] top-[40%] hidden w-[10%] max-w-[6rem] rotate-[5deg] 2xl:block',
    delay: '2.2s',
  },
  {
    src: '/brand/cards/mtg-bolt.jpg',
    alt: 'Magic: The Gathering — Lightning Bolt',
    className: 'right-[70%] top-[16%] hidden w-[10%] max-w-[6rem] rotate-[-11deg] 2xl:block',
    delay: '2.35s',
  },
  {
    src: '/brand/cards/fab-chane.jpg',
    alt: 'Flesh and Blood — Chane',
    className: 'left-[34%] top-[22%] hidden w-[11%] max-w-[6.5rem] rotate-[-6deg] xl:block',
    delay: '2.5s',
  },
  {
    src: '/brand/cards/op-ace.jpg',
    alt: 'One Piece Card Game — Portgas D. Ace',
    className: 'right-[40%] top-[44%] hidden w-[11%] max-w-[6.5rem] rotate-[13deg] 2xl:block',
    delay: '2.65s',
  },
]

/** Right-anchored layout for marketplace / auth panels (copy sits on the left). */
const RIGHT_FOCUS_CARDS: FloatCard[] = [
  {
    src: '/brand/cards/mtg-teferi.jpg',
    alt: 'Magic: The Gathering — Teferi, Hero of Dominaria',
    className: 'right-[2%] top-[4%] w-[30%] max-w-[10rem] rotate-[-10deg] sm:w-[22%]',
    delay: '0s',
  },
  {
    src: '/brand/cards/op-luffy.jpg',
    alt: 'One Piece Card Game — Monkey D. Luffy',
    className: 'right-[16%] top-[8%] w-[28%] max-w-[9.5rem] rotate-[8deg] sm:right-[18%] sm:w-[20%]',
    delay: '0.2s',
  },
  {
    src: '/brand/cards/pkm-charizard.jpg',
    alt: 'Pokémon — Charizard',
    className: 'right-[4%] bottom-[6%] w-[26%] max-w-[9rem] rotate-[6deg] sm:w-[18%]',
    delay: '0.45s',
  },
  {
    src: '/brand/cards/fab-bravo.jpg',
    alt: 'Flesh and Blood — Bravo',
    className: 'right-[24%] bottom-[3%] w-[24%] max-w-[8.5rem] rotate-[-7deg] sm:right-[26%] sm:w-[17%]',
    delay: '0.7s',
  },
  {
    src: '/brand/cards/pkm-pikachu.jpg',
    alt: 'Pokémon — Pikachu',
    className: 'right-[34%] top-[3%] hidden w-[18%] max-w-[8rem] rotate-[4deg] md:block',
    delay: '0.35s',
  },
  {
    src: '/brand/cards/mtg-ragavan.jpg',
    alt: 'Magic: The Gathering — Ragavan, Nimble Pilferer',
    className: 'right-[38%] bottom-[16%] hidden w-[16%] max-w-[7.5rem] rotate-[-4deg] lg:block',
    delay: '0.9s',
  },
  {
    src: '/brand/cards/op-zoro.jpg',
    alt: 'One Piece Card Game — Roronoa Zoro',
    className: 'right-[10%] top-[34%] hidden w-[16%] max-w-[7.5rem] rotate-[12deg] xl:block',
    delay: '1.1s',
  },
  {
    src: '/brand/cards/mtg-sheoldred.jpg',
    alt: 'Magic: The Gathering — Sheoldred, the Apocalypse',
    className: 'right-[46%] top-[18%] hidden w-[15%] max-w-[7rem] rotate-[-12deg] lg:block',
    delay: '1.25s',
  },
  {
    src: '/brand/cards/op-nami.jpg',
    alt: 'One Piece Card Game — Nami',
    className: 'right-[30%] top-[40%] hidden w-[15%] max-w-[7rem] rotate-[9deg] xl:block',
    delay: '1.4s',
  },
  {
    src: '/brand/cards/pkm-mewtwo.jpg',
    alt: 'Pokémon — Mewtwo',
    className: 'right-[52%] bottom-[8%] hidden w-[14%] max-w-[6.5rem] rotate-[5deg] xl:block',
    delay: '1.55s',
  },
  {
    src: '/brand/cards/fab-dorinthea.jpg',
    alt: 'Flesh and Blood — Dorinthea',
    className: 'right-[18%] bottom-[30%] hidden w-[14%] max-w-[6.5rem] rotate-[-8deg] xl:block',
    delay: '1.7s',
  },
  {
    src: '/brand/cards/mtg-lotus.jpg',
    alt: 'Magic: The Gathering — Black Lotus',
    className: 'right-[58%] top-[8%] hidden w-[13%] max-w-[6rem] rotate-[7deg] xl:block',
    delay: '1.85s',
  },
  {
    src: '/brand/cards/pkm-venusaur.jpg',
    alt: 'Pokémon — Venusaur',
    className: 'right-[42%] bottom-[34%] hidden w-[13%] max-w-[6rem] rotate-[-6deg] xl:block',
    delay: '2.0s',
  },
  {
    src: '/brand/cards/op-sanji.jpg',
    alt: 'One Piece Card Game — Sanji',
    className: 'right-[8%] bottom-[42%] hidden w-[13%] max-w-[6rem] rotate-[11deg] xl:block',
    delay: '2.15s',
  },
  {
    src: '/brand/cards/mtg-solring.jpg',
    alt: 'Magic: The Gathering — Sol Ring',
    className: 'right-[62%] bottom-[22%] hidden w-[12%] max-w-[5.5rem] rotate-[-10deg] 2xl:block',
    delay: '2.3s',
  },
  {
    src: '/brand/cards/pkm-gyarados.jpg',
    alt: 'Pokémon — Gyarados',
    className: 'right-[54%] top-[36%] hidden w-[12%] max-w-[5.5rem] rotate-[8deg] 2xl:block',
    delay: '2.45s',
  },
  {
    src: '/brand/cards/mtg-bolt.jpg',
    alt: 'Magic: The Gathering — Lightning Bolt',
    className: 'right-[26%] top-[52%] hidden w-[12%] max-w-[5.5rem] rotate-[-13deg] 2xl:block',
    delay: '2.6s',
  },
]

type FloatingCardsBackdropProps = {
  /** `scatter` = full field (landing). `right` = cards clustered on the right for copy+search heroes. */
  layout?: 'scatter' | 'right'
  className?: string
  /** Soft wash over the cards for text readability. */
  washClassName?: string
}

/**
 * Decorative floating TCG cards for marketing backgrounds.
 * Replaces stock photography with the vault’s multi-game card art.
 */
export function FloatingCardsBackdrop({
  layout = 'scatter',
  className,
  washClassName,
}: FloatingCardsBackdropProps) {
  const cards = layout === 'right' ? RIGHT_FOCUS_CARDS : FLOAT_CARDS

  return (
    <div aria-hidden className={cx('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {cards.map((card) => (
        <img
          key={`${layout}-${card.src}`}
          src={card.src}
          alt=""
          className={cx(
            'absolute rounded-xl object-cover',
            'shadow-[0_20px_50px_-18px_rgba(10,10,11,0.28)] ring-1 ring-[#c6a035]/45 dark:ring-[#dc2626]/35',
            'dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.75)] dark:ring-[#e0c15a]/35',
            'animate-[hero-float_7s_ease-in-out_infinite]',
            card.className,
          )}
          style={{ animationDelay: card.delay }}
          loading="eager"
          decoding="async"
        />
      ))}
      {washClassName ? <div className={cx('absolute inset-0', washClassName)} /> : null}
    </div>
  )
}

export default FloatingCardsBackdrop
