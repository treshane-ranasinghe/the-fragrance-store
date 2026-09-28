/* ==========================================================================
   Product catalogue. Manage it from admin.html, then use "Export products.js"
   there to publish — or edit this file by hand.
   ========================================================================== */

/*
  Each product:
    id      — also the image filename: images/products/<id>.jpg (or .png / .webp)
    tags    — any of "him", "her", "arabian" (controls the filter buttons)
    badge   — small label on the card (optional)
    sizes   — [{ ml, price }] in LKR; leave price null for "Price on request"
    inStock — false shows "Sold out" and disables adding to the bag

  NOTE: the prices below are placeholders — replace them with real prices.
*/
window.PRODUCTS = [
  {
    id: "boss-bottled-elixir",
    house: "Hugo Boss",
    name: "Boss Bottled Elixir",
    type: "Parfum Intense",
    tags: ["him"],
    badge: "Bestseller",
    sizes: [{ ml: 50, price: 38500 }, { ml: 100, price: 52500 }],
    inStock: true,
    description: "A richer, deeper take on an icon — warm spice and smooth vanilla wrapped in precious woods. Made for evenings that matter.",
    notes: {
      top: "Apple, Cinnamon",
      heart: "Cloves",
      base: "Vanilla, Woody Notes, Rum",
    },
  },
  {
    id: "azzaro-most-wanted-parfum",
    house: "Azzaro",
    name: "The Most Wanted Parfum",
    type: "Parfum",
    tags: ["him"],
    badge: "Signature",
    sizes: [{ ml: 50, price: 34500 }, { ml: 100, price: 46000 }],
    inStock: true,
    description: "Magnetic and daring. A fiery ginger opening melts into a sensual trail of bourbon vanilla and woods.",
    notes: {
      top: "Ginger",
      heart: "Woodsy Notes",
      base: "Bourbon Vanilla",
    },
  },
  {
    id: "jpg-le-male-elixir",
    house: "Jean Paul Gaultier",
    name: "Le Male Elixir",
    type: "Parfum",
    tags: ["him"],
    badge: "Icon",
    sizes: [{ ml: 75, price: 41000 }, { ml: 125, price: 54500 }],
    inStock: true,
    description: "The legendary sailor, dipped in gold. Fresh lavender and mint over a glowing heart of honey, tonka and tobacco.",
    notes: {
      top: "Mint, Lavender",
      heart: "Vanilla, Benzoin",
      base: "Tonka Bean, Honey, Tobacco",
    },
  },
  {
    id: "lattafa-khamrah",
    house: "Lattafa",
    name: "Khamrah",
    type: "Eau de Parfum",
    tags: ["arabian", "him", "her"],
    badge: "Arabian",
    sizes: [{ ml: 100, price: 14500 }],
    inStock: true,
    description: "An opulent Arabian gourmand — spiced dates and praline glowing over amberwood and vanilla. Unisex and unforgettable.",
    notes: {
      top: "Cinnamon, Nutmeg, Bergamot",
      heart: "Dates, Praline, Tuberose",
      base: "Vanilla, Tonka Bean, Amberwood, Myrrh",
    },
  },
  {
    id: "lattafa-asad-bourbon",
    house: "Lattafa",
    name: "Asad Bourbon",
    type: "Eau de Parfum",
    tags: ["arabian", "him"],
    badge: "New",
    sizes: [{ ml: 100, price: 12900 }],
    inStock: true,
    description: "A bold, bourbon-warm Arabian — smooth spice and sweet amber poured over deep, resinous woods.",
    notes: {
      top: "Pink Pepper, Lavender",
      heart: "Bourbon Vanilla, Coffee",
      base: "Amber, Vetiver, Patchouli",
    },
  },
  {
    id: "montblanc-explorer",
    house: "Montblanc",
    name: "Explorer",
    type: "Eau de Parfum",
    tags: ["him"],
    badge: null,
    sizes: [{ ml: 60, price: 24500 }, { ml: 100, price: 32000 }],
    inStock: true,
    description: "An invitation to adventure. Bright bergamot and pink pepper set out on a trail of vetiver, leather and warm woods.",
    notes: {
      top: "Bergamot, Pink Pepper, Clary Sage",
      heart: "Vetiver, Leather",
      base: "Patchouli, Ambroxan, Akigalawood",
    },
  },
];
