import { SceneKey, type NetService } from '../../contracts';
import { getRuntime } from '../../core/app';
import { C, addText, gildText } from '../style';
import { divider } from '../ui/skin';
import { Button, panel } from '../ui/widgets';
import { MenuScene } from './MenuScene';

/** same alphabet and length as src/net/protocol (render may not import net/) */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

interface LobbyData {
  join?: boolean;
  typed?: string;
}

/**
 * Online co-op lobby. Host: open a room and share the code, then play as usual.
 * Join: type the code on the on-screen keypad (or the keyboard) and command the army.
 */
export class LobbyScene extends MenuScene<LobbyData> {
  private typed = '';
  private codeText: Phaser.GameObjects.Text | null = null;
  private joinBtn: Button | null = null;

  constructor() {
    super(SceneKey.Lobby);
  }

  private get net(): NetService | undefined {
    return getRuntime().modules.net;
  }

  protected build(): void {
    const net = this.net;
    this.typed = this.args.typed ?? '';
    this.codeText = null;
    this.joinBtn = null;
    this.header(this.t('lobby.title'), { to: () => this.back() }, false);
    if (!net) {
      addText(this, this.vw / 2, 360, this.t('lobby.err_network'), 24, { originX: 0.5, originY: 0.5, color: C.text });
      return;
    }
    const off = net.onChange(() => this.rebuild());
    this.events.once('shutdown', off);

    const cx = this.vw / 2;
    const pw = Math.min(900, this.vw - 80);
    panel(this, cx - pw / 2, 104, pw, 560);
    const say = (y: number, key: string, size = 22, color: string = C.ink, vars?: Record<string, string | number>) =>
      addText(this, cx, y, this.t(key, vars), size, { originX: 0.5, originY: 0.5, color, bold: false });

    if (net.role === 'host') {
      say(160, 'lobby.host_title', 30, C.rubric);
      say(212, 'lobby.share_code');
      if (net.status === 'opening') say(330, 'lobby.opening', 26, C.inkSoft);
      else this.bigCode(cx, 310, net.code);
      if (net.status === 'connected') {
        say(410, 'lobby.connected', 30, C.greenInk);
        new Button(this, cx, 500, this.t('lobby.play'), () => this.go(SceneKey.Map), { w: 320, h: 72, variant: 'primary', size: 28, icon: 'ui_play', head: true });
      } else if (net.status === 'waiting') {
        const w = say(410, 'lobby.waiting_guest', 24, C.inkSoft);
        this.tweens.add({ targets: w, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
      } else if (net.status === 'error' || net.status === 'closed') say(410, net.error || 'lobby.err_network', 22, '#a02010');
      new Button(this, cx, 600, this.t('lobby.leave'), () => net.leave(), { w: 240, h: 56, variant: 'secondary', size: 21 });
      return;
    }

    if (net.role === 'guest') {
      say(170, 'lobby.join_title', 30, C.rubric);
      this.bigCode(cx, 280, net.code);
      if (net.status === 'connected') {
        say(390, 'lobby.connected', 30, C.greenInk);
        const w = say(450, 'lobby.waiting_host', 23, C.inkSoft);
        this.tweens.add({ targets: w, alpha: 0.4, duration: 900, yoyo: true, repeat: -1 });
        say(510, 'lobby.guest_role', 18, C.inkSoft);
      } else say(400, 'lobby.connecting', 26, C.inkSoft);
      new Button(this, cx, 600, this.t('lobby.leave'), () => net.leave(), { w: 240, h: 56, variant: 'secondary', size: 21 });
      return;
    }

    // not connected: choose, or type a code
    if (net.error) say(this.args.join ? 644 : 140, net.error, 20, '#a02010');
    if (!this.args.join) {
      say(190, 'lobby.intro', 21, C.inkSoft);
      divider(this, cx, 226, 420);
      new Button(this, cx, 320, this.t('lobby.host'), () => net.host(), {
        w: 420, h: 84, variant: 'primary', size: 30, head: true, sub: this.t('lobby.host_sub'),
      });
      new Button(this, cx, 450, this.t('lobby.join'), () => this.scene.restart({ join: true } satisfies LobbyData), {
        w: 420, h: 84, variant: 'gold', size: 30, head: true, sub: this.t('lobby.join_sub'),
      });
      return;
    }
    this.keypad(cx, net);
  }

  private bigCode(cx: number, y: number, code: string): void {
    // body font: the blackletter head font makes L/I and U/V hard to tell apart
    const t = addText(this, cx, y, code.split('').join(' '), 60, { originX: 0.5, originY: 0.5, color: '#7a4e08' });
    gildText(t);
  }

  private keypad(cx: number, net: NetService): void {
    addText(this, cx, 150, this.t('lobby.enter_code'), 24, { originX: 0.5, originY: 0.5, color: C.rubric, font: 'head' });
    this.codeText = addText(this, cx, 214, '', 52, { originX: 0.5, originY: 0.5, color: '#7a4e08' });
    const cols = 8;
    const kw = 78;
    const kh = 56;
    const gap = 10;
    const x0 = cx - ((cols - 1) * (kw + gap)) / 2;
    CODE_ALPHABET.split('').forEach((ch, i) => {
      const x = x0 + (i % cols) * (kw + gap);
      const y = 300 + Math.floor(i / cols) * (kh + gap);
      new Button(this, x, y, ch, () => this.type(ch), { w: kw, h: kh, variant: 'secondary', size: 26 });
    });
    const by = 300 + 4 * (kh + gap) + 30;
    new Button(this, cx - 250, by, '⌫', () => this.erase(), { w: 140, h: 60, variant: 'secondary', size: 28 });
    this.joinBtn = new Button(this, cx + 110, by, this.t('lobby.join_go'), () => this.submit(net), { w: 300, h: 64, variant: 'primary', size: 26, icon: 'ui_play', head: true });
    this.refreshCode();
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Backspace') this.erase();
      else if (ev.key === 'Enter') this.submit(net);
      else if (ev.key.length === 1) {
        const ch = ev.key.toUpperCase();
        if (CODE_ALPHABET.includes(ch)) this.type(ch);
      }
    };
    // a plain DOM listener: Phaser's keyboard queue merged fast keystrokes on slow frames
    window.addEventListener('keydown', onKey);
    this.events.once('shutdown', () => window.removeEventListener('keydown', onKey));
  }

  private type(ch: string): void {
    if (this.typed.length < CODE_LEN) this.typed += ch;
    this.refreshCode();
  }

  private erase(): void {
    this.typed = this.typed.slice(0, -1);
    this.refreshCode();
  }

  private refreshCode(): void {
    const shown = (this.typed + '_'.repeat(CODE_LEN - this.typed.length)).split('').join(' ');
    this.codeText?.setText(shown);
    this.joinBtn?.setEnabled(this.typed.length === CODE_LEN);
    this.args.typed = this.typed;
  }

  private submit(net: NetService): void {
    if (this.typed.length === CODE_LEN) net.join(this.typed);
  }

  private back(): void {
    const net = this.net;
    if (this.args.join && net?.role === 'off') {
      this.scene.restart({} satisfies LobbyData);
      return;
    }
    this.go(SceneKey.Title);
  }
}
