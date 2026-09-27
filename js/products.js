/* ==========================================================================
   Store settings + product catalogue — edit this file to update the site.
   ========================================================================== */

window.STORE = {
  // WhatsApp number in international format, digits only (94 = Sri Lanka).
  whatsapp: "94XXXXXXXXX",
  phone: "+94 XX XXX XXXX",
  email: "hello@thefragrancestore.lk",
  instagram: "https://www.instagram.com/",
  facebook: "https://www.facebook.com/",
  tiktok: "https://www.tiktok.com/",
  maps: "https://maps.google.com/?q=The+Fragrance+Store+Colombo",
};

/*
  Each product:
    id      — also the image filename: images/products/<id>.jpg (or .png / .webp)
    tags    — any of "him", "her", "arabian" (controls the filter buttons)
    badge   — small label on the card (optional)
    price   — e.g. "LKR 38,500" — leave null to show "Price on request"
*/
window.PRODUCTS = [
  {
    id: "boss-bottled-elixir",
    house: "Hugo Boss",
    name: "Boss Bottled Elixir",
    type: "Parfum Intense",
    tags: ["him"],
    badge: "Bestseller",
    price: null,
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
    price: null,
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
    price: null,
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
    price: null,
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
    price: null,
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
    price: null,
    description: "An invitation to adventure. Bright bergamot and pink pepper set out on a trail of vetiver, leather and warm woods.",
    notes: {
      top: "Bergamot, Pink Pepper, Clary Sage",
      heart: "Vetiver, Leather",
      base: "Patchouli, Ambroxan, Akigalawood",
    },
  },
];
