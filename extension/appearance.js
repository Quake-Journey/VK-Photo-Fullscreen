globalThis.VKPhotoAppearance = `
  :host { all: initial; color-scheme: dark; }
  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  button, select, label { font: 500 14px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    border: 1px solid #ffffff24; color: #eff3fa; background: #222832;
    border-radius: 10px; cursor: pointer; padding: 10px 14px; min-height: 40px;
    touch-action: manipulation; transition: background .12s, border-color .12s; }
  button:hover { background: #354155; border-color: #94bfff88; }
  button:focus-visible, select:focus-visible { outline: 2px solid #8bc2ff; outline-offset: 3px; }
  button:disabled { opacity: .3; cursor: default; }
  svg { width: 20px; height: 20px; stroke: currentColor; stroke-width: 1.8;
    fill: none; stroke-linecap: round; stroke-linejoin: round; flex: none; }
  #launch { pointer-events: auto; position: fixed; top: 24px; right: 26px;
    background: #2262b0; color: #fff; box-shadow: 0 4px 24px #0008;
    padding: 12px 18px; border-color: #b6d6ff55; }
  #launch:hover { background: #2a78d3; }
  #viewer { pointer-events: auto; position: fixed; inset: 0; width: 100vw; height: 100vh;
    background: #0c0e12; overflow: hidden; outline: none; color: #eff3fa;
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  #viewer:fullscreen { width: 100%; height: 100%; }
  #canvas { display: block; width: 100%; height: 100%; cursor: grab; touch-action: none; }
  #canvas.dragging { cursor: grabbing; }
  .top { position: absolute; inset: 0 0 auto; display: flex; justify-content: space-between;
    align-items: flex-start; padding: 18px 22px 55px; gap: 16px;
    background: linear-gradient(#080a0ee8, #080a0e70, transparent); pointer-events: none; }
  .identity { padding: 6px 0; min-width: 0; text-shadow: 0 1px 4px #000; }
  .identity strong { display: block; font-size: 15px; font-weight: 600; letter-spacing: .2px; }
  #info { display: block; color: #aebaca; font-size: 12px; padding-top: 3px; }
  #enhance-status { display: block; color: #b5dec8; font-size: 12px; padding-top: 4px; }
  .top-actions { display: flex; gap: 8px; pointer-events: auto; }
  #close { background: #292b32e6; }
  .nav { position: absolute; top: 50%; transform: translateY(-50%); width: 52px;
    height: 64px; padding: 0; border-radius: 14px; background: #171e2bbd;
    box-shadow: 0 3px 20px #0005; }
  .nav svg { width: 28px; height: 28px; }
  #prev { left: 20px; } #next { right: 20px; }
  .bottom { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
    display: flex; align-items: center; gap: 6px; padding: 7px; border-radius: 15px;
    background: #141b27ed; border: 1px solid #ffffff20; box-shadow: 0 5px 28px #0008;
    white-space: nowrap; max-width: calc(100vw - 24px); flex-wrap: wrap; justify-content: center; }
  .bottom button { background: transparent; border-color: transparent; }
  .bottom button:hover { background: #354155; }
  #zoom { width: 60px; text-align: center; font-variant-numeric: tabular-nums; color: #c7d9ef; }
  .separator { width: 1px; height: 22px; background: #ffffff25; margin: 0 4px; }
  select { color: #dae6f4; background: #232e40; border: 1px solid #ffffff1c;
    padding: 10px; border-radius: 9px; cursor: pointer; }
  .enhance-controls { display: inline-flex; gap: 6px; align-items: center; }
  #enhance-scale { min-height: 40px; min-width: 62px; background: #244537; color: #dcf5e8; }
  .enhance-toggle { display: inline-flex; gap: 9px; align-items: center; padding: 10px 12px;
    border-radius: 9px; background: #244537; color: #dcf5e8; cursor: pointer; min-height: 40px; }
  .enhance-toggle:hover { background: #305941; }
  .enhance-toggle input { appearance: auto; accent-color: #70d6a2; width: 18px; height: 18px;
    margin: 0; cursor: pointer; }
  .enhance-toggle:has(input:not(:checked)) { background: #28303b; color: #b7c1d0; }
  .enhance-toggle input:focus-visible { outline: 2px solid #8bc2ff; outline-offset: 3px; }
  #message { position: absolute; bottom: 92px; left: 50%; transform: translateX(-50%);
    max-width: min(650px, 90vw); background: #182335ed; border: 1px solid #819ac344;
    padding: 10px 16px; border-radius: 10px; color: #e5efff; text-align: center; }
  #loading { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    padding: 14px 22px; background: #17202edb; border-radius: 12px; }
  @media (max-width: 650px) {
    .top { padding: 12px; } .identity strong { font-size: 13px; }
    #prev { left: 8px; } #next { right: 8px; } .nav { width: 40px; height: 54px; }
    .bottom { bottom: 12px; gap: 0; padding: 4px; }
    .bottom button { padding: 8px; font-size: 12px; } select { max-width: 110px; font-size: 12px; }
    .separator { margin: 0 2px; } #zoom { width: 48px; font-size: 12px; }
    #launch { top: 12px; right: 12px; }
  }
`;
