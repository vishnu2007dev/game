/**
 * The only DOM interface on top of the 3D view: a quiet hint telling the
 * player screens can be read, and a Back control while one is open.
 */
export function buildHud(root: HTMLElement, touch: boolean) {
  const hud = document.createElement('div');
  hud.className = 'hud';
  hud.innerHTML = `
    <p class="hud-hint" id="hud-hint">${touch ? 'Tap' : 'Click'} a screen to read it</p>
    <button class="hud-back" id="hud-back" type="button" hidden>Back to desk</button>
    <p class="hud-rotate" id="hud-rotate" hidden>Turn your phone sideways to read this screen more easily</p>
  `;
  root.appendChild(hud);
  const hint = hud.querySelector<HTMLElement>('#hud-hint')!;
  const back = hud.querySelector<HTMLButtonElement>('#hud-back')!;
  const rotate = hud.querySelector<HTMLElement>('#hud-rotate')!;
  return {
    back,
    setFocused(name: string | null) {
      back.hidden = name === null;
      hint.hidden = name !== null;
      rotate.hidden = name === null || innerWidth > innerHeight;
      if (name) back.setAttribute('aria-label', `Back to desk from ${name}`);
    },
  };
}
