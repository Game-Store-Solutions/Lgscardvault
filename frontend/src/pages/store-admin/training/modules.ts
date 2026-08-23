import type { TrainingModule } from './types'

/**
 * Add media on a step with `image: '/training/file.png'` or `videoUrl`
 * (YouTube, Vimeo, or `/training/clip.mp4`). Record on a real store admin
 * session — do not invent frames.
 */

export const TRAINING_CATEGORIES: { id: TrainingModule['category']; label: string }[] = [
  { id: 'start', label: 'Get started' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'sales', label: 'Sales' },
  { id: 'storefront', label: 'Storefront' },
]

export const TRAINING_MODULES: TrainingModule[] = [
  {
    id: 'see-your-shop',
    title: 'See what shoppers see',
    summary: 'Open your public storefront and learn which admin pages change each part.',
    minutes: 3,
    category: 'start',
    steps: [
      {
        title: 'Open the live storefront',
        body: 'Shoppers land on /s/your-slug. The hero, games, spotlight rail, and search filters all come from your admin — not from a separate website.',
        image: '/training/storefront-browse.png',
        imageAlt: 'A live LGS Card Vault storefront with hero, game filters, and spotlight cards',
        href: '/',
        hrefLabel: 'View storefront',
      },
      {
        title: 'Match each block to an admin page',
        body: 'Branding sets logo, colors, and hero. Spotlight pins featured singles. Events fill the calendar. Inventory and Imports fill the grid. Payments is what lets them check out.',
        href: '/admin/branding',
        hrefLabel: 'Open Branding',
      },
    ],
  },
  {
    id: 'take-cards',
    title: 'Take live card payments',
    summary: 'Connect Square, turn on location tax, and keep card numbers out of this app.',
    minutes: 5,
    category: 'start',
    steps: [
      {
        title: 'Connect Square',
        body: 'On Payments, connect Square and approve access so checkout can charge your seller account. Shopper money never settles to LGS Card Vault.',
        href: '/admin/payments',
        hrefLabel: 'Open Payments',
      },
      {
        title: 'Turn on sales tax in Square',
        body: 'In Square Dashboard for this location, enable the correct sales tax. In a sales-tax state, card checkout will not complete if Square quotes $0 tax. Alaska, Delaware, Montana, New Hampshire, and Oregon can complete at $0.',
        href: '/admin/payments',
        hrefLabel: 'Open Payments',
      },
      {
        title: 'Never type card numbers here',
        body: 'Shoppers enter cards only in Square’s form. Do not type PAN into LGS Card Vault, email, or chat. Chargebacks are answered in Square’s dispute console — a flag appears on the order here when Square notifies us.',
        href: '/admin/orders',
        hrefLabel: 'Open Orders',
      },
    ],
  },
  {
    id: 'add-singles',
    title: 'Add singles',
    summary: 'Search the catalog, pick a printing, and set condition, finish, qty, and price.',
    minutes: 4,
    category: 'inventory',
    steps: [
      {
        title: 'Search the catalog, not the web',
        body: 'Singles searches the game catalog. Every printing that exists can be added — not only what you already stock. Pick the game first so results stay on that game.',
        href: '/admin',
        hrefLabel: 'Open Singles',
      },
      {
        title: 'Set condition, finish, and price',
        body: 'Add the printing, then set quantity, condition, finish (foil / nonfoil), and price. Edit later from the same inventory card. Use Imports when you have a spreadsheet.',
        href: '/admin',
        hrefLabel: 'Open Singles',
      },
    ],
  },
  {
    id: 'import-csv',
    title: 'Import a spreadsheet',
    summary: 'Upload a CSV, preview the mapping, then watch the run until it finishes.',
    minutes: 6,
    category: 'inventory',
    steps: [
      {
        title: 'Start the import wizard',
        body: 'Imports walks game → singles or sealed → file → preview → import. Large files resolve against the catalog in batches, so give them a few minutes.',
        href: '/admin/csv',
        hrefLabel: 'Open Imports',
      },
      {
        title: 'Fix failed rows',
        body: 'When a run finishes, open the import to see failed or skipped rows. You can search the catalog and place those cards, or send them back to the queue.',
        href: '/admin/csv',
        hrefLabel: 'Open Imports',
      },
    ],
  },
  {
    id: 'sealed',
    title: 'Stock sealed product',
    summary: 'Add boxes, bundles, and decks from the sealed catalog.',
    minutes: 3,
    category: 'inventory',
    steps: [
      {
        title: 'Pick the game, then add product',
        body: 'Sealed lists what you already stock and the catalog underneath. Prices can start from the market snapshot — change them before you save.',
        href: '/admin/sealed',
        hrefLabel: 'Open Sealed',
      },
    ],
  },
  {
    id: 'orders',
    title: 'Fill pickup orders',
    summary: 'Paid online or reserved to pay at the counter — everything is pickup.',
    minutes: 5,
    category: 'sales',
    steps: [
      {
        title: 'Read the queue',
        body: 'Orders shows open pickups. Paid online is already charged through Square. Pay-in-store is reserved until they pay at the counter. There is no shipping.',
        href: '/admin/orders',
        hrefLabel: 'Open Orders',
      },
      {
        title: 'Complete pickup, then handle problems',
        body: 'When they collect, complete the order. Refunds go through Square from this admin. If Square opens a dispute, a flag appears here — gather pickup proof (name, time, staff notes) and respond in Square. We do not auto-restock disputed orders.',
        href: '/admin/orders',
        hrefLabel: 'Open Orders',
      },
    ],
  },
  {
    id: 'buy-list',
    title: 'Buy and trade from the public',
    summary: 'Set a buy list, then review shopper submissions at the counter.',
    minutes: 6,
    category: 'sales',
    steps: [
      {
        title: 'Publish the cards you want',
        body: 'Sell / Trade is your buy list. Leave the offer blank to pay your premium rate at market, or pin a per-copy price. Those cards show on your public Sell/Trade page.',
        href: '/admin/sell-trade',
        hrefLabel: 'Open Sell / Trade',
      },
      {
        title: 'Review a submission',
        body: 'When a shopper submits, open Review. Accept or trim lines, print a counter sheet, then accept the offer. Complete & stock inventory when you take the cards in person.',
        href: '/admin/sell-trade',
        hrefLabel: 'Open Sell / Trade',
      },
    ],
  },
  {
    id: 'credit',
    title: 'Store credit',
    summary: 'Credit stays at this store. Use it for buy-list payouts and counter corrections.',
    minutes: 2,
    category: 'sales',
    steps: [
      {
        title: 'Adjust a balance',
        body: 'Store credit never leaves this shop. Adjustments are for counter corrections and goodwill — not a cash-out to another store.',
        href: '/admin/store-credit',
        hrefLabel: 'Open Store credit',
      },
    ],
  },
  {
    id: 'branding',
    title: 'Brand the storefront',
    summary: 'Logo, colors, hero photos, and how inventory cards look.',
    minutes: 5,
    category: 'storefront',
    steps: [
      {
        title: 'Colors and logo',
        body: 'Branding saves as you go. Set light and dark colors, upload a logo, then a light (and optional dark) hero photo. Crop sliders move the photo inside the banner — they do not change the banner size.',
        href: '/admin/branding',
        hrefLabel: 'Open Branding',
      },
      {
        title: 'Hero and card layout',
        body: 'Choose a hero layout and how singles render (gallery vs compact). Hours and contact in the footer are the same fields shoppers see on the storefront.',
        href: '/admin/branding',
        hrefLabel: 'Open Branding',
      },
    ],
  },
  {
    id: 'spotlight',
    title: 'Pin spotlight cards',
    summary: 'Control the premium rail on the homepage.',
    minutes: 3,
    category: 'storefront',
    steps: [
      {
        title: 'Floor, length, and pins',
        body: 'Spotlight uses a price floor plus min/max rail length. Pin in-stock singles to lead the rail; the rest fill automatically from inventory above the floor.',
        href: '/admin/spotlight',
        hrefLabel: 'Open Spotlight',
      },
    ],
  },
  {
    id: 'events',
    title: 'Post events',
    summary: 'Fill the public calendar and the event-board hero.',
    minutes: 3,
    category: 'storefront',
    steps: [
      {
        title: 'Board copy, then listings',
        body: 'Events has community-board headline copy plus up to 50 listings. Pin the ones that should stay at the top of the public calendar.',
        href: '/admin/events',
        hrefLabel: 'Open Events',
      },
    ],
  },
  {
    id: 'cases',
    title: 'Display cases',
    summary: 'Track what sits in a physical case and print pull or stocking sheets.',
    minutes: 4,
    category: 'inventory',
    steps: [
      {
        title: 'Cases, sections, sheets',
        body: 'A case is a physical display. Split it into sections, add listings to each section, then print a pull sheet or a stocking sheet for the counter.',
        href: '/admin/case-cards',
        hrefLabel: 'Open Case cards',
      },
    ],
  },
  {
    id: 'team',
    title: 'Add staff',
    summary: 'Give employees a login without handing over the owner account.',
    minutes: 2,
    category: 'start',
    steps: [
      {
        title: 'Invite by email',
        body: 'Users lets you add an employee by email and set a password. Admin access opens this dashboard. You cannot delete your own owner account from here.',
        href: '/admin/users',
        hrefLabel: 'Open Users',
      },
    ],
  },
]
