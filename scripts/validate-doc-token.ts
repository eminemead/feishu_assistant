#!/usr/bin/env bun

const docId = "L7v9dyAvLoaJBixTvgPcecLqnIh";

// Feishu token patterns:
// - Sheet: S-xxxxxxxxxxxxx (40+ chars)
// - Doc: L-xxxxxxxxxxxxx (20+ chars, alphanumeric)
// - Wiki: W-xxxxxxxxxxxxx
// - Bitable: T-xxxxxxxxxxxxx
// - Docx: L-xxxxxxxxxxxxx (new doc type)

console.log("Token validation for:", docId);
console.log("Length:", docId.length);
console.log("Starts with L-:", docId.startsWith("L"));
console.log("Alphanumeric:", /^[A-Za-z0-9]+$/.test(docId));
console.log("Pattern (L...Ih):", docId.match(/^L.*Ih$/));

// Try with format normalization
const normalized = docId.replace(/[^A-Za-z0-9]/g, '');
console.log("\nNormalized token:", normalized);

// Check if it could be a share URL token that needs extraction
const shareUrlPattern = docId.match(/docs\/([a-zA-Z0-9]+)/);
if (shareUrlPattern) {
  console.log("Extracted from URL:", shareUrlPattern[1]);
}

// Feishu also uses URL-encoded tokens sometimes
console.log("\nURL-encoded test:", encodeURIComponent(docId));
