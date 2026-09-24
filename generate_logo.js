import sharp from 'sharp';
import fs from 'fs';

const svgContent = `
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 400 500"
  width="400"
  height="500"
>
  <defs>
    <style>
      .bg-dark { fill: #111215; }
      .gold-fill { fill: #C5AC86; }
      .gold-stroke { stroke: #C5AC86; fill: none; }
      .text-serif {
        font-family: 'Times New Roman', Times, serif;
        fill: #C5AC86;
        text-anchor: middle;
      }
    </style>
  </defs>

  <rect width="400" height="500" class="bg-dark" />

  <path
    d="M50 60 L350 60 L350 250 C350 380 200 460 200 460 C200 460 50 380 50 250 Z"
    class="gold-stroke"
    stroke-width="1.5"
  />

  <path
    d="M58 68 L342 68 L342 250 C342 372 200 448 200 448 C200 448 58 372 58 250 Z"
    class="gold-stroke"
    stroke-width="1"
  />

  <text
    x="200"
    y="145"
    class="text-serif"
    font-size="72"
    letter-spacing="5"
  >
    ABES
  </text>

  <line
    x1="58"
    y1="165"
    x2="342"
    y2="165"
    class="gold-stroke"
    stroke-width="1"
  />

  <g transform="translate(0,-5)">
    <path
      d="M98 280 A102 102 0 0 1 302 280"
      class="gold-stroke"
      stroke-width="16"
    />

    <path
      d="M98 280 A102 102 0 0 1 302 280"
      stroke="#111215"
      stroke-width="18"
      stroke-dasharray="6 15"
      fill="none"
    />

    <path
      d="M90 280 A110 110 0 0 1 310 280"
      class="gold-stroke"
      stroke-width="2"
    />

    <path
      d="M120 280 A80 80 0 0 1 280 280 Z"
      class="gold-fill"
    />

    <g fill="#111215">
      <path d="M194 270 C194 270 180 240 200 223 C220 240 206 270 206 270 Z" />
      <path d="M189 271 C189 271 160 255 160 235 C180 240 192 260 192 260 Z" />
      <path d="M211 271 C211 271 240 255 240 235 C220 240 208 260 208 260 Z" />
      <path d="M183 275 C183 275 140 270 135 255 C160 255 183 266 183 266 Z" />
      <path d="M217 275 C217 275 260 270 265 255 C240 255 217 266 217 266 Z" />
      <path d="M120 282 Q160 270 200 283 Q240 270 280 282 L280 285 Q240 273 200 286 Q160 273 120 285 Z" />
      <path d="M130 275 Q165 263 200 278 Q235 263 270 275 L270 278 Q235 268 200 281 Q165 268 130 278 Z" />
    </g>

    <rect
      x="110"
      y="284"
      width="180"
      height="4"
      class="gold-fill"
    />
  </g>

  <text
    x="200"
    y="325"
    class="text-serif"
    font-size="34"
    letter-spacing="4"
  >
    ABES
  </text>

  <text
    x="200"
    y="352"
    class="text-serif"
    font-size="17"
    letter-spacing="5"
  >
    AUTONOMY
  </text>

  <line
    x1="135"
    y1="370"
    x2="190"
    y2="370"
    class="gold-stroke"
    stroke-width="1"
  />

  <polygon
    points="200,366 204,370 200,374 196,370"
    class="gold-fill"
  />

  <line
    x1="210"
    y1="370"
    x2="265"
    y2="370"
    class="gold-stroke"
    stroke-width="1"
  />

  <text
    x="200"
    y="400"
    class="text-serif"
    font-size="18"
    letter-spacing="1"
  >
    Estd. 2025
  </text>
</svg>
`;

async function convert() {
  await sharp(Buffer.from(svgContent))
    .png()
    .toFile('./logo.png');
  console.log('Logo generated');
}

convert();
