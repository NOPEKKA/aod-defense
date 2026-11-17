/** Spell and item icons (groups `spells` and `items`). Owner: items art agent. */
import { staticBuilt } from '../character';
import { defineIcon, type IconDef } from '../icon';
import * as I from '../props_items_icons';
import { hullOutline } from '../props_items';
import type * as THREE from 'three';

type B = () => THREE.Object3D | Promise<THREE.Object3D>;
function icon(id: string, group: 'spells' | 'items', b: B, o: Partial<IconDef> = {}): void {
  defineIcon({
    id,
    group,
    build: async () => {
      const obj = await b();
      hullOutline(obj);
      return staticBuilt(obj);
    },
    outline: 0,
    span: 1.75, lookAt: [0, 0.62, 0], yaw: 25, pitch: 10, ...o });
}

icon('icon_super_boomstick', 'spells', I.iconBoomstick, { yaw: 12, span: 2.3, lookAt: [0.15, 0.62, 0] });
icon('icon_arrow_volley', 'spells', I.iconArrows, { yaw: 8, span: 2.1 });
icon('icon_magic_words', 'spells', I.iconOpenBook, { yaw: 8, span: 1.9, lookAt: [0, 0.7, 0] });
icon('icon_catapult_volley', 'spells', I.iconBoulder, { yaw: 10, span: 2.5, lookAt: [-0.15, 0.7, 0] });
icon('icon_wrong_book', 'spells', I.iconWrongBook, { yaw: 8, pitch: 14, span: 1.9 });
icon('icon_chainsaw', 'spells', I.iconChainsaw, { yaw: 10, span: 1.8, lookAt: [0.1, 0.62, 0] });
icon('icon_deathcoaster', 'spells', I.iconCart, { yaw: 0, span: 2.0, lookAt: [0, 0.65, 0] });
icon('icon_salt_circle', 'spells', I.iconSaltCircle, { yaw: 0, pitch: 38, span: 1.95 });
icon('icon_matins_bell', 'spells', I.iconBell, { yaw: 8, span: 1.9 });
icon('icon_hellfire_pitch', 'spells', I.iconPitch, { yaw: 10, span: 2.0, lookAt: [0, 0.8, 0] });
icon('icon_bear_traps', 'spells', I.iconBearTrap, { yaw: 20, pitch: 42, span: 1.8 });
icon('icon_dawn_lance', 'spells', I.iconLance, { yaw: 6, span: 2.5, lookAt: [0.15, 0.7, 0] });
icon('icon_rally_horn', 'spells', I.iconHorn, { yaw: 6, span: 2.4, lookAt: [0.15, 0.75, 0] });

icon('ui_iron', 'items', I.iconIron, { yaw: 25, pitch: 22, span: 1.9 });
icon('ui_gold', 'items', I.iconGold, { yaw: 25, pitch: 14, span: 1.7 });
icon('ui_mana', 'items', I.iconMana, { yaw: 10, span: 1.5, lookAt: [0, 0.65, 0] });
icon('ui_skull', 'items', I.iconSkull, { yaw: 14, pitch: 8, span: 1.5 });
icon('ui_book', 'items', I.iconBook, { yaw: 14, span: 1.7 });
icon('ui_banner_advance', 'items', I.iconBannerAdvance, { yaw: 10, span: 2.3, lookAt: [0.15, 0.62, 0] });
icon('ui_banner_hold', 'items', I.iconBannerHold, { yaw: 14, span: 1.9, lookAt: [0, 0.7, 0] });
icon('ui_anvil', 'items', I.iconAnvil, { yaw: 25, pitch: 14, span: 1.9, lookAt: [0, 0.6, 0] });
icon('relic_gravedigger_lantern', 'items', I.relicLantern, { yaw: 14, span: 1.8 });
icon('relic_mire_cauldron_shard', 'items', I.relicCauldronShard, { yaw: 14, span: 2.3, lookAt: [0.05, 0.5, 0] });
icon('relic_hollow_spur', 'items', I.relicSpur, { yaw: 14, span: 2.0 });
icon('relic_censer_of_matins', 'items', I.relicCenser, { yaw: 10, span: 1.9, lookAt: [0, 0.7, 0] });
icon('relic_doppel_boomstick', 'items', I.relicDoppelBoomstick, { yaw: 10, span: 2.0 });
