export function Cat({
  hat = false,
  className = "",
}: {
  hat?: boolean;
  className?: string;
}) {
  return (
    <svg
      className={`cat ${className}`}
      viewBox="0 0 220 210"
      fill="none"
      role="img"
      aria-label="โมจิ แมวสีครีมของเราสองคน"
    >
      <ellipse cx="110" cy="192" rx="67" ry="9" fill="#D3B8A6" opacity=".22" />
      <path
        d="M153 169c49 9 49-40 26-34"
        stroke="#DFBFA0"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <path
        d="M65 148c0-31 90-31 90 0l8 34c-7 18-101 18-108 0z"
        fill="#F3D9BA"
      />
      <path
        d="M49 89 48 29q1-11 12-3l37 28m74 35 1-60q-1-11-12-3l-37 28"
        fill="#F8E7D1"
        stroke="#795D4E"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="m57 41 3 34 23-17m80-17-3 34-23-17" fill="#EAB2AB" />
      <path
        d="M39 106c0-37 27-57 71-57s71 20 71 57c0 42-27 64-71 64s-71-22-71-64Z"
        fill="#F8E7D1"
        stroke="#795D4E"
        strokeWidth="3"
      />
      <path
        d="M104 51v21m12-21v18"
        stroke="#D5AA85"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <ellipse cx="65" cy="122" rx="13" ry="8" fill="#EDB2A9" />
      <ellipse cx="155" cy="122" rx="13" ry="8" fill="#EDB2A9" />
      <g
        className="cat-eyes"
        stroke="#61483D"
        strokeWidth="4"
        strokeLinecap="round"
      >
        <path d="M73 105q8-10 16 0m42 0q8-10 16 0" />
      </g>
      <path
        d="m105 114 5 4 5-4m-5 4v8m0 0q-8 9-15 0m15 0q8 9 15 0"
        stroke="#795D4E"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m43 116-20-4m20 14-20 3m154-13 20-4m-20 14 20 3"
        stroke="#B3937C"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M85 174v15m50-15v15"
        stroke="#D2AD8A"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M99 155h22l-3 12h-16z" fill="#C7DCD0" />
      <path d="M106 158h8v6h-8z" fill="#B98A49" />
      {hat && (
        <g>
          <path
            d="M65 55h91l-19-17H83Z"
            fill="#B6D8C9"
            stroke="#688A7A"
            strokeWidth="2"
          />
          <path
            d="m81 39 8-26h41l8 26"
            fill="#BFE5D7"
            stroke="#688A7A"
            strokeWidth="2"
          />
          <path d="M85 32h49" stroke="#EFA9AD" strokeWidth="6" />
        </g>
      )}
    </svg>
  );
}
export function CatScene({
  name,
  hat = false,
  compact = false,
}: {
  name: string;
  hat?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`cat-scene ${compact ? "compact-scene" : ""}`}>
      <div className="scene-window">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="scene-sun" />
      <div className="scene-plant">
        <svg viewBox="0 0 70 110" aria-hidden="true">
          <path d="M35 80V24" stroke="#7B9D81" strokeWidth="3" />
          <path
            d="M35 53C2 53 10 19 35 39c26-31 41-1 0 14m0 16C3 74 3 45 35 58c33-21 44 7 0 11"
            fill="#98B9A0"
          />
          <path d="m16 77 7 29h26l7-29" fill="#E9B69D" />
        </svg>
      </div>
      <span className="scene-spark spark-one">✦</span>
      <span className="scene-spark spark-two">✧</span>
      <div className="cat-bubble">อยู่ด้วยกันแบบนี้ทุกวันเลยนะ ♡</div>
      <Cat hat={hat} />
      <div className="scene-rug" />
      <div className="scene-name">{name} · เจ้าของบ้านตัวจริง</div>
    </div>
  );
}
