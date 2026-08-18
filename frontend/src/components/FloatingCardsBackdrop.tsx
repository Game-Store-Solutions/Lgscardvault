import { cx } from '../lib/cx'

export type FloatCard = {
  src: string
  alt: string
  className: string
  delay: string
}

/**
 * Full-field scatter for the marketing landing.
 * Cards form a dense wreath around the center copy — no empty mid-side pockets.
 * Density grows with viewport; Riftbound mixed with classic TCGs.
 */
export const FLOAT_CARDS: FloatCard[] = [
  // —— Corner anchors (always) ——
  {
    src: '/brand/cards/mtg-teferi.jpg',
    alt: 'Magic: Teferi',
    className: 'left-[-1%] top-[2%] w-[22%] max-w-[9rem] -rotate-12 sm:left-[1%] sm:w-[14%]',
    delay: '0s',
  },
  {
    src: '/brand/cards/op-luffy.jpg',
    alt: 'One Piece: Luffy',
    className: 'right-[-1%] top-[1%] w-[23%] max-w-[9rem] rotate-9 sm:right-[1%] sm:w-[14%]',
    delay: '0.12s',
  },
  {
    src: '/brand/cards/rb-jinx.jpg',
    alt: 'Riftbound: Jinx, Rebel',
    className: 'left-[-1%] bottom-[1%] w-[22%] max-w-[9rem] rotate-7 sm:left-[1%] sm:w-[14%]',
    delay: '0.24s',
  },
  {
    src: '/brand/cards/pkm-charizard.jpg',
    alt: 'Pokémon: Charizard',
    className: 'right-[-1%] bottom-[0%] w-[23%] max-w-[9rem] -rotate-8 sm:right-[1%] sm:w-[14%]',
    delay: '0.36s',
  },

  // —— Top / bottom mid (always) — close the horizontal gaps ——
  {
    src: '/brand/cards/rb-ahri.jpg',
    alt: 'Riftbound: Ahri',
    className: 'left-[18%] top-[-2%] w-[17%] max-w-[7.5rem] rotate-4 sm:w-[12%]',
    delay: '0.08s',
  },
  {
    src: '/brand/cards/fab-bravo.jpg',
    alt: 'Flesh and Blood: Bravo',
    className: 'left-[36%] top-[-1%] w-[16%] max-w-[7.25rem] -rotate-3 sm:w-[11.5%]',
    delay: '0.18s',
  },
  {
    src: '/brand/cards/pkm-pikachu.jpg',
    alt: 'Pokémon: Pikachu',
    className: 'right-[34%] top-[-2%] w-[16%] max-w-[7.25rem] rotate-6 sm:w-[11.5%]',
    delay: '0.28s',
  },
  {
    src: '/brand/cards/mtg-ragavan.jpg',
    alt: 'Magic: Ragavan',
    className: 'right-[16%] top-[-1%] w-[17%] max-w-[7.5rem] -rotate-5 sm:w-[12%]',
    delay: '0.4s',
  },
  {
    src: '/brand/cards/op-zoro.jpg',
    alt: 'One Piece: Zoro',
    className: 'left-[17%] bottom-[-2%] w-[17%] max-w-[7.5rem] -rotate-4 sm:w-[12%]',
    delay: '0.48s',
  },
  {
    src: '/brand/cards/rb-annie.jpg',
    alt: 'Riftbound: Annie',
    className: 'left-[35%] bottom-[-1%] w-[16%] max-w-[7.25rem] rotate-5 sm:w-[11.5%]',
    delay: '0.56s',
  },
  {
    src: '/brand/cards/mtg-sheoldred.jpg',
    alt: 'Magic: Sheoldred',
    className: 'right-[34%] bottom-[-2%] w-[16%] max-w-[7.25rem] -rotate-6 sm:w-[11.5%]',
    delay: '0.64s',
  },
  {
    src: '/brand/cards/fab-dorinthea.jpg',
    alt: 'Flesh and Blood: Dorinthea',
    className: 'right-[16%] bottom-[-1%] w-[17%] max-w-[7.5rem] rotate-3 sm:w-[12%]',
    delay: '0.72s',
  },

  // —— Side mid-ring (always) — kill the empty vertical pockets ——
  {
    src: '/brand/cards/rb-yasuo.jpg',
    alt: 'Riftbound: Yasuo',
    className: 'left-[-2%] top-[28%] w-[18%] max-w-[7.75rem] -rotate-11 sm:left-[0%] sm:w-[12.5%]',
    delay: '0.32s',
  },
  {
    src: '/brand/cards/pkm-mewtwo.jpg',
    alt: 'Pokémon: Mewtwo',
    className: 'left-[-1%] top-[48%] w-[17%] max-w-[7.5rem] rotate-8 sm:left-[1%] sm:w-[12%]',
    delay: '0.44s',
  },
  {
    src: '/brand/cards/op-nami.jpg',
    alt: 'One Piece: Nami',
    className: 'right-[-2%] top-[26%] w-[18%] max-w-[7.75rem] rotate-10 sm:right-[0%] sm:w-[12.5%]',
    delay: '0.52s',
  },
  {
    src: '/brand/cards/rb-lux.jpg',
    alt: 'Riftbound: Lux',
    className: 'right-[-1%] top-[46%] w-[17%] max-w-[7.5rem] -rotate-9 sm:right-[1%] sm:w-[12%]',
    delay: '0.6s',
  },

  // —— sm+: inner wreath (closer to copy, fills remaining pockets) ——
  {
    src: '/brand/cards/rb-darius.jpg',
    alt: 'Riftbound: Darius',
    className: 'left-[12%] top-[16%] hidden w-[13%] max-w-[6.75rem] rotate-7 sm:block',
    delay: '0.8s',
  },
  {
    src: '/brand/cards/mtg-lotus.jpg',
    alt: 'Magic: Black Lotus',
    className: 'right-[12%] top-[14%] hidden w-[13%] max-w-[6.75rem] -rotate-6 sm:block',
    delay: '0.9s',
  },
  {
    src: '/brand/cards/pkm-blastoise.jpg',
    alt: 'Pokémon: Blastoise',
    className: 'left-[12%] bottom-[14%] hidden w-[13%] max-w-[6.75rem] -rotate-5 sm:block',
    delay: '1.0s',
  },
  {
    src: '/brand/cards/op-sanji.jpg',
    alt: 'One Piece: Sanji',
    className: 'right-[12%] bottom-[13%] hidden w-[13%] max-w-[6.75rem] rotate-8 sm:block',
    delay: '1.1s',
  },
  {
    src: '/brand/cards/fab-lexi.jpg',
    alt: 'Flesh and Blood: Lexi',
    className: 'left-[22%] top-[38%] hidden w-[12%] max-w-[6.5rem] rotate-12 sm:block',
    delay: '1.2s',
  },
  {
    src: '/brand/cards/rb-vi.jpg',
    alt: 'Riftbound: Vi',
    className: 'right-[22%] top-[36%] hidden w-[12%] max-w-[6.5rem] -rotate-10 sm:block',
    delay: '1.3s',
  },
  {
    src: '/brand/cards/mtg-solring.jpg',
    alt: 'Magic: Sol Ring',
    className: 'left-[24%] bottom-[30%] hidden w-[12%] max-w-[6.5rem] -rotate-7 sm:block',
    delay: '1.4s',
  },
  {
    src: '/brand/cards/pkm-venusaur.jpg',
    alt: 'Pokémon: Venusaur',
    className: 'right-[24%] bottom-[28%] hidden w-[12%] max-w-[6.5rem] rotate-6 sm:block',
    delay: '1.5s',
  },

  // —— md+: denser mid ring ——
  {
    src: '/brand/cards/rb-leesin.jpg',
    alt: 'Riftbound: Lee Sin',
    className: 'left-[6%] top-[38%] hidden w-[11%] max-w-[6.25rem] rotate-4 md:block',
    delay: '1.55s',
  },
  {
    src: '/brand/cards/rb-kaisa.jpg',
    alt: "Riftbound: Kai'Sa",
    className: 'right-[6%] top-[38%] hidden w-[11%] max-w-[6.25rem] -rotate-5 md:block',
    delay: '1.65s',
  },
  {
    src: '/brand/cards/mtg-atraxa.jpg',
    alt: 'Magic: Atraxa',
    className: 'left-[48%] top-[4%] hidden w-[11%] max-w-[6.25rem] rotate-9 md:block',
    delay: '0.75s',
  },
  {
    src: '/brand/cards/op-shanks.jpg',
    alt: 'One Piece: Shanks',
    className: 'right-[48%] top-[5%] hidden w-[11%] max-w-[6.25rem] -rotate-8 md:block',
    delay: '1.75s',
  },
  {
    src: '/brand/cards/pkm-gengar.jpg',
    alt: 'Pokémon: Gengar',
    className: 'left-[48%] bottom-[3%] hidden w-[11%] max-w-[6.25rem] -rotate-4 md:block',
    delay: '1.85s',
  },
  {
    src: '/brand/cards/fab-chane.jpg',
    alt: 'Flesh and Blood: Chane',
    className: 'right-[48%] bottom-[4%] hidden w-[11%] max-w-[6.25rem] rotate-7 md:block',
    delay: '1.95s',
  },
  {
    src: '/brand/cards/mtg-oko.jpg',
    alt: 'Magic: Oko',
    className: 'left-[34%] top-[28%] hidden w-[10.5%] max-w-[6rem] -rotate-9 md:block',
    delay: '2.05s',
  },
  {
    src: '/brand/cards/rb-jinx-demo.jpg',
    alt: 'Riftbound: Jinx, Demolitionist',
    className: 'right-[34%] top-[26%] hidden w-[10.5%] max-w-[6rem] rotate-5 md:block',
    delay: '2.15s',
  },

  // —— lg+: fill remaining seams ——
  {
    src: '/brand/cards/pkm-mew.jpg',
    alt: 'Pokémon: Mew',
    className: 'left-[34%] bottom-[22%] hidden w-[10%] max-w-[5.75rem] rotate-8 lg:block',
    delay: '2.25s',
  },
  {
    src: '/brand/cards/op-law.jpg',
    alt: 'One Piece: Law',
    className: 'right-[34%] bottom-[20%] hidden w-[10%] max-w-[5.75rem] -rotate-7 lg:block',
    delay: '2.35s',
  },
  {
    src: '/brand/cards/mtg-force.jpg',
    alt: 'Magic: Force of Will',
    className: 'left-[8%] top-[18%] hidden w-[10%] max-w-[5.75rem] -rotate-12 lg:block',
    delay: '2.45s',
  },
  {
    src: '/brand/cards/fab-ira.jpg',
    alt: 'Flesh and Blood: Ira',
    className: 'right-[8%] top-[17%] hidden w-[10%] max-w-[5.75rem] rotate-11 lg:block',
    delay: '2.55s',
  },
  {
    src: '/brand/cards/pkm-lugia.jpg',
    alt: 'Pokémon: Lugia',
    className: 'left-[8%] bottom-[32%] hidden w-[10%] max-w-[5.75rem] rotate-6 lg:block',
    delay: '2.65s',
  },
  {
    src: '/brand/cards/mtg-bowmasters.jpg',
    alt: 'Magic: Orcish Bowmasters',
    className: 'right-[8%] bottom-[31%] hidden w-[10%] max-w-[5.75rem] -rotate-6 lg:block',
    delay: '2.75s',
  },
  {
    src: '/brand/cards/op-ace.jpg',
    alt: 'One Piece: Ace',
    className: 'left-[18%] top-[50%] hidden w-[10%] max-w-[5.75rem] rotate-3 lg:block',
    delay: '2.85s',
  },
  {
    src: '/brand/cards/fab-prism.jpg',
    alt: 'Flesh and Blood: Prism',
    className: 'right-[18%] top-[49%] hidden w-[10%] max-w-[5.75rem] -rotate-4 lg:block',
    delay: '2.95s',
  },

  // —— xl / 2xl: fine fill ——
  {
    src: '/brand/cards/pkm-rayquaza.jpg',
    alt: 'Pokémon: Rayquaza',
    className: 'left-[42%] top-[18%] hidden w-[9.5%] max-w-[5.5rem] rotate-10 xl:block',
    delay: '3.0s',
  },
  {
    src: '/brand/cards/pkm-gyarados.jpg',
    alt: 'Pokémon: Gyarados',
    className: 'right-[42%] top-[17%] hidden w-[9.5%] max-w-[5.5rem] -rotate-9 xl:block',
    delay: '3.1s',
  },
  {
    src: '/brand/cards/mtg-bolt.jpg',
    alt: 'Magic: Lightning Bolt',
    className: 'left-[42%] bottom-[16%] hidden w-[9.5%] max-w-[5.5rem] -rotate-5 xl:block',
    delay: '3.15s',
  },
  {
    src: '/brand/cards/mtg-rhystic.jpg',
    alt: 'Magic: Rhystic Study',
    className: 'right-[42%] bottom-[15%] hidden w-[9.5%] max-w-[5.5rem] rotate-7 xl:block',
    delay: '3.2s',
  },
  {
    src: '/brand/cards/pkm-alakazam.jpg',
    alt: 'Pokémon: Alakazam',
    className: 'left-[2%] top-[62%] hidden w-[9.5%] max-w-[5.5rem] rotate-9 2xl:block',
    delay: '3.3s',
  },
  {
    src: '/brand/cards/fab-prism-hq.jpg',
    alt: 'Flesh and Blood: Prism',
    className: 'right-[2%] top-[62%] hidden w-[9.5%] max-w-[5.5rem] -rotate-8 2xl:block',
    delay: '3.4s',
  },
]

/** Right-anchored layout for marketplace / auth panels — denser side stack. */
const RIGHT_FOCUS_CARDS: FloatCard[] = [
  {
    src: '/brand/cards/mtg-teferi.jpg',
    alt: 'Magic: Teferi',
    className: 'right-[1%] top-[2%] w-[28%] max-w-[9.5rem] -rotate-10 sm:w-[18%]',
    delay: '0s',
  },
  {
    src: '/brand/cards/rb-jinx.jpg',
    alt: 'Riftbound: Jinx',
    className: 'right-[14%] top-[6%] w-[26%] max-w-[9rem] rotate-8 sm:w-[16%]',
    delay: '0.12s',
  },
  {
    src: '/brand/cards/op-luffy.jpg',
    alt: 'One Piece: Luffy',
    className: 'right-[2%] bottom-[4%] w-[26%] max-w-[9rem] rotate-6 sm:w-[16%]',
    delay: '0.24s',
  },
  {
    src: '/brand/cards/pkm-charizard.jpg',
    alt: 'Pokémon: Charizard',
    className: 'right-[20%] bottom-[2%] w-[24%] max-w-[8.5rem] -rotate-7 sm:w-[15%]',
    delay: '0.36s',
  },
  {
    src: '/brand/cards/rb-ahri.jpg',
    alt: 'Riftbound: Ahri',
    className: 'right-[28%] top-[2%] w-[20%] max-w-[8rem] rotate-4 sm:w-[14%]',
    delay: '0.2s',
  },
  {
    src: '/brand/cards/rb-yasuo.jpg',
    alt: 'Riftbound: Yasuo',
    className: 'right-[6%] top-[30%] w-[20%] max-w-[8rem] rotate-11 sm:w-[14%]',
    delay: '0.45s',
  },
  {
    src: '/brand/cards/fab-bravo.jpg',
    alt: 'Flesh and Blood: Bravo',
    className: 'right-[32%] bottom-[12%] w-[18%] max-w-[7.5rem] -rotate-4 sm:w-[13%]',
    delay: '0.55s',
  },
  {
    src: '/brand/cards/rb-annie.jpg',
    alt: 'Riftbound: Annie',
    className: 'right-[8%] top-[48%] hidden w-[16%] max-w-[7.25rem] -rotate-8 sm:block',
    delay: '0.7s',
  },
  {
    src: '/brand/cards/mtg-sheoldred.jpg',
    alt: 'Magic: Sheoldred',
    className: 'right-[40%] top-[14%] hidden w-[15%] max-w-[7rem] -rotate-11 sm:block',
    delay: '0.85s',
  },
  {
    src: '/brand/cards/pkm-mewtwo.jpg',
    alt: 'Pokémon: Mewtwo',
    className: 'right-[44%] bottom-[6%] hidden w-[14%] max-w-[6.5rem] rotate-5 md:block',
    delay: '1.0s',
  },
  {
    src: '/brand/cards/op-zoro.jpg',
    alt: 'One Piece: Zoro',
    className: 'right-[22%] top-[36%] hidden w-[14%] max-w-[6.5rem] -rotate-6 md:block',
    delay: '1.15s',
  },
  {
    src: '/brand/cards/rb-lux.jpg',
    alt: 'Riftbound: Lux',
    className: 'right-[52%] top-[6%] hidden w-[13%] max-w-[6rem] rotate-7 md:block',
    delay: '1.3s',
  },
  {
    src: '/brand/cards/rb-darius.jpg',
    alt: 'Riftbound: Darius',
    className: 'right-[36%] top-[42%] hidden w-[13%] max-w-[6rem] -rotate-5 md:block',
    delay: '1.45s',
  },
  {
    src: '/brand/cards/mtg-atraxa.jpg',
    alt: 'Magic: Atraxa',
    className: 'right-[12%] bottom-[28%] hidden w-[13%] max-w-[6rem] rotate-9 lg:block',
    delay: '1.6s',
  },
  {
    src: '/brand/cards/op-shanks.jpg',
    alt: 'One Piece: Shanks',
    className: 'right-[56%] bottom-[18%] hidden w-[12%] max-w-[5.75rem] -rotate-8 lg:block',
    delay: '1.75s',
  },
  {
    src: '/brand/cards/rb-vi.jpg',
    alt: 'Riftbound: Vi',
    className: 'right-[58%] top-[28%] hidden w-[12%] max-w-[5.5rem] -rotate-10 xl:block',
    delay: '1.9s',
  },
  {
    src: '/brand/cards/rb-leesin.jpg',
    alt: 'Riftbound: Lee Sin',
    className: 'right-[46%] top-[48%] hidden w-[12%] max-w-[5.5rem] rotate-6 xl:block',
    delay: '2.05s',
  },
  {
    src: '/brand/cards/pkm-gengar.jpg',
    alt: 'Pokémon: Gengar',
    className: 'right-[28%] top-[52%] hidden w-[12%] max-w-[5.5rem] -rotate-12 xl:block',
    delay: '2.2s',
  },
  {
    src: '/brand/cards/rb-kaisa.jpg',
    alt: "Riftbound: Kai'Sa",
    className: 'right-[64%] top-[18%] hidden w-[11%] max-w-[5.25rem] rotate-5 xl:block',
    delay: '2.35s',
  },
  {
    src: '/brand/cards/mtg-oko.jpg',
    alt: 'Magic: Oko',
    className: 'right-[50%] top-[24%] hidden w-[11%] max-w-[5.25rem] rotate-8 2xl:block',
    delay: '2.5s',
  },
  {
    src: '/brand/cards/op-law.jpg',
    alt: 'One Piece: Law',
    className: 'right-[40%] bottom-[36%] hidden w-[11%] max-w-[5.25rem] -rotate-9 2xl:block',
    delay: '2.65s',
  },
  {
    src: '/brand/cards/rb-jinx-demo.jpg',
    alt: 'Riftbound: Jinx, Demolitionist',
    className: 'right-[68%] bottom-[32%] hidden w-[10%] max-w-[5rem] rotate-10 2xl:block',
    delay: '2.8s',
  },
]

type FloatingCardsBackdropProps = {
  layout?: 'scatter' | 'right'
  className?: string
  washClassName?: string
  /**
   * Catalog art to fill the composition with (see `useShowcaseCards`). The
   * hand-tuned positions below are reused and only the images swap, so real
   * inventory can rotate through without redesigning the layout. Falls back to
   * the bundled art when empty.
   */
  images?: string[]
}

export function FloatingCardsBackdrop({
  layout = 'scatter',
  className,
  washClassName,
  images,
}: FloatingCardsBackdropProps) {
  // Dense field for the landing scatter; the side layouts stay lighter so they
  // don't fight the copy sitting next to them.
  const layoutCards = layout === 'right' ? RIGHT_FOCUS_CARDS.slice(0, 14) : FLOAT_CARDS
  const cards =
    images && images.length > 0
      ? layoutCards.map((card, index) => ({ ...card, src: images[index % images.length], alt: '' }))
      : layoutCards

  return (
    <div aria-hidden className={cx('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {cards.map((card, i) => (
        <img
          key={`${layout}-${card.src}-${i}`}
          src={card.src}
          alt=""
          className={cx(
            'absolute rounded-xl object-cover',
            'opacity-[0.78] saturate-[0.92]',
            'shadow-[0_16px_44px_-18px_rgba(10,10,11,0.22)] ring-1 ring-white/8 dark:ring-white/10',
            'dark:shadow-[0_24px_60px_-18px_rgba(0,0,0,0.72)]',
            'animate-[hero-float_8.5s_ease-in-out_infinite]',
            card.className,
          )}
          style={{ animationDelay: card.delay }}
          // Only the first ring blocks first paint; the rest stream in.
          loading={i < 12 ? 'eager' : 'lazy'}
          decoding="async"
        />
      ))}
      {washClassName ? <div className={cx('absolute inset-0', washClassName)} /> : null}
    </div>
  )
}

export default FloatingCardsBackdrop
