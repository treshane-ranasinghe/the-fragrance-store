/* ==========================================================================
   Store settings — contact details, delivery and payment options.
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

  // Shop settings (all amounts in LKR)
  currency: "LKR",
  deliveryFee: 450,          // island-wide delivery
  freeDeliveryOver: 25000,   // free delivery at or above this subtotal (0 = never free)
  codFee: 0,                 // extra charge for cash on delivery
  codLimit: 150000,          // COD not offered above this total (0 = no limit)
  pickup: true,              // allow collecting from the boutique
  // Districts offered at checkout (remove any you don't deliver to)
  districts: [
    "Ampara", "Anuradhapura", "Badulla", "Batticaloa", "Colombo", "Galle", "Gampaha",
    "Hambantota", "Jaffna", "Kalutara", "Kandy", "Kegalle", "Kilinochchi", "Kurunegala",
    "Mannar", "Matale", "Matara", "Monaragala", "Mullaitivu", "Nuwara Eliya",
    "Polonnaruwa", "Puttalam", "Ratnapura", "Trincomalee", "Vavuniya",
  ],
  bank: {
    name: "Commercial Bank",
    branch: "Colombo",
    accountName: "The Fragrance Store (Pvt) Ltd",
    accountNumber: "0000000000",
  },
};
