// Draft descriptions for owner review (2026-11-11)
// Gear (2026-11-13): one generated line per gear family + material (gearLore below), unless written here.
import { FAMILIES } from './data/gear/families';
import { MATERIALS } from './data/gear/materials';
import { TIERS_LIVE } from './data/gear/model';
import { OVERRIDES } from './data/gear/families';
// One short line per item id, shown in the encyclopedia. No numbers that may change.

export const ITEM_LORE: Record<string, string> = {
  // ores and gems
  copper_ore: "Green-streaked rock that every apprentice digs first. Smelts into bars for almost everything.",
  tin_ore: "Dull grey and unloved, until it meets copper. Together they make bronze.",
  iron_ore: "Heavy, rust-red and honest. Smelt it with coal for bars worth building on.",
  coal: "Black, dusty and the reason every smelter's nose is the same colour. Feeds the furnace.",
  silver_ore: "Pale metal that glints in lamplight. Good for fine rings and for steadier hands at the forge.",
  gold_ore: "Soft, shiny and tempting. Smelt it into bars for jewellery and showy gear.",
  mithril_ore: "A cool blue ore from the deepest shafts. Light as a rumour, strong as a promise.",
  rough_gem: "An uncut stone, not much to look at. Jewellers set them in beginner rings.",
  sapphire: "A deep blue gem with a calm, steady shine. Cut into prisms or set in signets.",
  ruby: "A blood-red gem that seems to hold its own small fire. Prized for war-bands and weapons.",

  // wood
  pine_log: "A plain, sappy log. Cheap, plentiful, and smells like a good morning.",
  oak_log: "A stout log from the old groves. Saw it into planks for sturdier builds.",
  yew_log: "Dark, springy timber that bows are born from. Slow to find, worth the wait.",
  ironwood_log: "So dense it dulls axes and tempers. The finest planks come from this.",
  amber_resin: "Sticky gold sap from the trees. Boils down to varnish or toughens good leather.",

  // plants and fibres
  flax_fiber: "Pale stalks from the flax patch. Spin it into thread and you're a weaver.",
  wild_grain: "Handfuls of wild wheat. Mostly ends up as bread, and nobody minds.",
  mint_leaf: "Cool, bright and everywhere by the river. Brews into tonics and perks up a fish dish.",
  nettle_fiber: "Stings going in, weaves up tough. Makes a hardy canvas for sturdy clothes.",
  bloodmoss: "A dark red moss that grows where it shouldn't. Good in broths and restoring brews.",
  frostcap: "A pale mushroom that stays cold in summer. Prized by alchemists and clever cooks.",
  sunpetal: "A rare golden bloom that follows the sun. A pinch can mend a great deal.",

  // fish and pearls
  minnow: "Tiny silver fish, caught by the net-load. Grill them and call it lunch.",
  trout: "A plump brook trout. Bakes up nicely with a bit of mint.",
  salmon: "A strong red fish from the run. Pies, searing, or the odd pearl found inside.",
  abyssal_angler: "An ugly deep-water fish with a lantern on its head. Makes a feast worth boasting about.",
  river_pearl: "A smooth pearl from the river beds. Jewellers love it, and so do stargazing alchemists.",
  black_pearl: "A rare dark pearl that drinks the light. Sets beautifully in a mender's ring.",

  // hunting drops
  scrap_hide: "A ragged scrap of hide. Tan it, and it's the start of your first leathers.",
  bone_shard: "A splinter of bone. Handy in tonics, bows and anything that wants a bit of grit.",
  wolf_pelt: "Thick grey fur with a faint smell of wet dog. Tans into tougher leather.",
  bear_hide: "A heavy, scarred hide from the high passes. Cure it well and it'll turn blades.",
  drake_hide: "A scaled hide still warm to the touch. Needs patient tanning, and rewards it.",
  spider_silk: "Fine strands harvested with great care and a bit of swearing. Spins into silk thread.",
  faint_essence: "A thin wisp of glow, barely there. Enough for a salve or a simple staff.",
  glow_essence: "A steady pale-green glow in a jar. Used in brews, staves and glowing jewellery.",
  storm_essence: "A crackling violet essence that tingles in your teeth. Powers stronger healing work.",
  moon_essence: "Silver light caught in a vial. Rare, and wanted by every high-end tailor and alchemist.",
  stone_heart: "The cold core of a granite golem. Guardians swear by the maul it makes.",
  drake_scale: "A thick, jade-green scale off a roost warden. Heavy armour worth the trouble.",

  // refined: metal
  copper_bar: "A rosy bar of copper. The first thing a smith learns to make, and use for everything.",
  copper_rivet: "A small, handy copper rivet. Armour is held together by hundreds of these.",
  bronze_bar: "A warm golden-brown bar. Harder than copper, and the start of proper weapons.",
  iron_bar: "A solid bar of grey iron. The backbone of mid-game smithing.",
  steel_bar: "Iron refined with extra coal. Sharper, springier, and worth the extra fuel.",
  silver_bar: "A bright bar of silver. Rings, fine hardware and the odd holy blessing.",
  gold_bar: "A heavy, buttery bar. More for show than strength, but the jewellers adore it.",
  mithril_bar: "A pale blue bar that feels too light to be real. The best metal a smith can pour.",

  // refined: wood
  pine_plank: "A clean pine plank, easy to work. Fine for bucklers, bows and beginner staves.",
  oak_plank: "A sturdy oak plank. Shields and staves built from it last longer.",
  yew_plank: "A springy dark plank. Bowyers fight over it.",
  ironwood_plank: "Dense, dark and near unbreakable. Reserved for the finest weapons and shields.",
  wood_varnish: "A glossy brew boiled from resin. Protects wood and finishes fine work.",

  // refined: leather
  rough_leather: "Stiff, simple leather. Cut, stitched, and you've got a first set of armour.",
  tanned_leather: "Supple leather from wolf pelts. Strong enough for studded armour and good straps.",
  leather_strap: "A useful strip of leather. Everything needs binding to something.",
  hardened_leather: "Boiled and treated until it rings when tapped. Light, tough armour comes from this.",
  drakeskin: "Treated drake hide, glossy green and hard to pierce. Top-tier light armour.",

  // refined: cloth
  linen_thread: "Plain, strong thread from flax. Tailors and bowyers alike go through reels of it.",
  linen_cloth: "Soft woven linen. The base of every beginner's robe and hood.",
  nettle_canvas: "Rugged cloth woven from nettles. Tough, a little scratchy, perfect for working clothes.",
  silk_thread: "Fine pale thread spun from spider silk. Strong, and surprisingly smooth.",
  silk_cloth: "Smooth, light and expensive. A mender's best friend.",
  moonweave: "Silk woven with moonlight. Faintly glowing, impossibly soft, and very hard to find.",

  // boss materials
  ember_scale: "A scale that is still hot. Dropped by the Ashen Wyrm, and loved by lens-makers.",
  rime_shard: "A shard of ice that never melts. A prize from the Rimefang Matriarch.",
  venom_gland: "Best handled with tongs and good manners. A grim trophy from the blight.",
  halo_fragment: "A shard of golden light, warm to hold. Fell from the Sunfallen Seraph.",
  grave_silver: "Silver that has lain with the dead. A cold, heavy trophy from the Hollow King.",
  abyssal_pearl: "A sea-green pearl from the depths. Pulled from the Abyssal Leviathan.",

  // boss cores
  wyrm_core: "A smouldering heart-stone from the Ashen Wyrm. Raiders prize it, for good reason.",
  rimefang_core: "A frozen core from the Rimefang Matriarch. Cold, bright and rare.",
  blight_core: "A throbbing green core from the Blightroot Colossus. Handle it with respect.",
  seraph_core: "A bright golden core from the Sunfallen Seraph. It hums softly if you listen.",
  crown_core: "A dark violet core from the Hollow King's crown. Heavier than it looks.",
  leviathan_core: "A teal core from the Abyssal Leviathan. Smells faintly of the deep.",

  // gear: strikers
  frostbite_saber: "A pale steel saber with a chill to it. Strong against fire-wielding foes.",
  venomstring_bow: "A yew bow strung with silk and bloodmoss. Poisonous, and not for the squeamish.",

  // gear: guardians
  stoneheart_maul: "A maul set with a golem's heart. Thuds like a falling hillside.",

  // gear: menders
  dawnward_staff: "A yew staff topped with storm essence and silver. Healing, with a holy glow.",

  // gear: rings

  // gear: tools and clothing

  // food
  bread: "A warm loaf of wild-grain bread. Plain, filling, and always welcome.",
  grilled_minnows: "A skewer of crisp little fish. Cheap, salty, and eaten whole.",
  herb_trout: "Brook trout baked with mint. A proper meal that puts the spring back in a step.",
  bloodmoss_broth: "A dark, earthy broth that warms you right through. Great before a hard fight.",
  salmon_pie: "A flaky pie stuffed with salmon. The town bakery's pride and joy.",
  frostcap_salmon: "Seared salmon with a hint of frostcap. Cool, rich and very restorative.",
  angler_feast: "A grand platter of deep-water fish and sunpetal. Share it, or don't.",

  // potions
  mint_tonic: "A cooling mint tonic. Perks up the tired and fixes small hurts.",
  wisplight_salve: "A pale glowing salve. Rub it on a scrape and feel it fade.",
  ironskin_draught: "A gritty grey draught. Makes skin feel sturdier for the fight ahead.",
  fury_draught: "A bitter red brew. Makes you want to hit things, and hit them harder.",
  restoring_elixir: "A rosy elixir that knits wounds quickly. A good stock item for any crew.",
  frostward_tonic: "A chilly blue tonic. Patches you up and toughens you for a while.",
  clarity_draught: "A clear violet drink. Hands go steadier, and healing flows more freely.",
  sunpetal_elixir: "A golden elixir that mends deep wounds and boosts healing. Savoured, not gulped.",
  rimeheart_draught: "A pale draught with a cold kick. Heals a little, and hardens you a lot.",

  // catalysts
  quickening_salts: "Gritty salts that help a craft along. Add them and see what happens.",
  cut_prism: "A cut sapphire prism that bends luck your way. Improves the odds on a good craft.",
  starlight_reagent: "A shimmering powder of moon and pearl. Gives crafts a better shot at greatness.",
  emberglass_lens: "A lens of glowing glass. Focuses a craft's luck like a spark into tinder."
};

// ---- generated gear lore (gear overhaul): "<what it is>. <material line>"
const TYPE_LORE: Record<string, string> = {
  sword: 'A balanced one-handed blade for strikers who like a guard to fall back on.',
  axe: 'A one-handed war axe: no finesse, all bite.',
  dagger: 'A quick, light blade that keeps its wielder nimble.',
  spear: 'A long spear that keeps trouble at arm\'s length and then some.',
  greatsword: 'A two-handed blade for strikers who never plan to block.',
  bow: 'A two-handed bow; it carries an element further than any blade.',
  mace: 'A one-handed mace, as good for holding a line as breaking one.',
  warhammer: 'A two-handed hammer that guards and bruises in equal measure.',
  halberd: 'An axe on a pole, for guardians who like to strike first.',
  wand: 'A slim wand that channels mending without a word.',
  scepter: 'A weighted scepter: half mending focus, half club.',
  staff: 'A two-handed staff, the mender\'s oldest friend.',
  parrying_dagger: 'A short off-hand blade for catching what the main hand misses.',
  shield: 'A sturdy shield. Guardians hide behind it so others don\'t have to.',
  tome: 'A thick book of mending rites, held in the off hand.',
  helm: 'A plate helm. Heavy, hot and very reassuring.',
  cuirass: 'A plate cuirass that turns blows and adds a lot of staying power.',
  greaves: 'Plate greaves for standing your ground.',
  cap: 'A fitted leather cap that keeps a striker light on their feet.',
  jerkin: 'A leather jerkin, tough where it counts and loose where it moves.',
  breeches: 'Reinforced leather breeches for long days in the wilds.',
  hood: 'A soft hood that steadies a mender\'s mind.',
  robe: 'A mender\'s robe, stitched with patience and a little luck.',
  trousers: 'Cloth trousers lined for warmth and quiet steps.',
  signet: 'A signet ring that lends a sharper edge to every strike.',
  band: 'A plain, solid band. Guardians swear it helps.',
  loop: 'A slender ring that makes mending come easier.',
  pendant: 'A pendant worn by strikers for the bite it lends.',
  torc: 'A heavy torc for a guardian\'s neck and nerve.',
  locket: 'A locket a mender keeps close; it hums when someone is hurt.',
  pickaxe: 'A miner\'s pickaxe. A better one gets through the rock faster.',
  felling_axe: 'A woodcutter\'s felling axe. Keep it sharp and the trees come down quicker.',
  sickle: 'A curved sickle for herbs and grain. Speeds up every harvest.',
  fishing_rod: 'A fishing rod with a good bend. Bites come quicker.',
  bellows: 'Smithy bellows that keep the furnace hot enough to waste less ore.',
  saw: 'A carpenter\'s saw. Clean cuts mean fewer spoiled logs.',
  fleshing_scraper: 'A scraper for working hides; less waste on every pelt.',
  spindle: 'A drop spindle that spins thread evenly and wastes little fibre.',
  smith_hammer: 'A smith\'s hammer. In steady hands the work comes out finer.',
  chisel: 'A woodworker\'s chisel for fine, careful cuts.',
  awl: 'A leatherworker\'s awl for neat, strong stitching.',
  needle_set: 'A tailor\'s needle set. Finer stitches, finer work.',
  gem_file: 'A jeweller\'s gem file for crisp facets.',
  mortar: 'A mortar and pestle. Grind it right and a batch sometimes makes double.',
  rolling_pin: 'A cook\'s rolling pin. Good dough stretches further than you think.',
  field_cap: 'A field cap for long days gathering.', field_vest: 'A field vest with pockets for everything you find.',
  field_gloves: 'Work gloves for picking, digging and hauling.', field_boots: 'Field boots for mud, moss and riverbanks.',
  work_cap: 'A work cap that keeps sweat out of your eyes at the furnace and the vat.', work_smock: 'A heavy smock for refining work.',
  work_gloves: 'Thick work gloves for hot bars and rough hides.', work_boots: 'Work boots with good soles for a long shift.',
  craft_cap: 'A craft cap that keeps hair out of the work.', craft_apron: 'A craftsman\'s apron with a loop for every tool.',
  craft_gloves: 'Thin craft gloves for steady, careful hands.', craft_boots: 'Comfortable craft boots for long hours at the bench.'
};
const MAT_LORE: Record<string, string> = {
  bronze: 'Bronze: the first proper metal of the guild town.', iron: 'Iron: plain, heavy and dependable.', steel: 'Steel with a silver trim, made to last.',
  mithril: 'Mithril, light as a rumour.', wyrmforged: 'Wyrmforged from mithril and a boss\'s spoils.',
  pine: 'Pine: light, cheap and easy to work.', oak: 'Oak: stout and steady.', yew: 'Yew: dark, springy and prized.', ironwood: 'Ironwood, nearly as hard as metal.', heartwood: 'Heartwood, grown around something that should not be there.',
  leather: 'Rough leather, cut and stitched at home.', studded: 'Tanned leather studded with rivets.', hardened: 'Hardened leather, boiled and shaped.', drakeskin: 'Drakeskin, warm to the touch.', wyrmhide: 'Wyrmhide with ember scales set in.',
  hessian: 'Hessian: coarse, cheap and honest.', linen: 'Linen and canvas, neat and hard-wearing.', silk: 'Silk, smooth and surprisingly tough.', finesilk: 'Fine silk, light as air.', moonweave: 'Moonweave that glows faintly at night.',
  copper: 'Copper set with a rough stone.', glowstone: 'Set with a glowstone that never quite goes dark.', sapphire: 'Silver set with a sapphire or a river pearl.', ruby: 'Gold set with a ruby.', rime: 'Set with a rime shard that is always cold.'
};
const NAMED_LORE: Record<string, string> = {
  anglers_hat: 'A wide-brimmed hat that smells faintly of the river. Part of a gathering outfit.',
  foragers_satchel: 'A satchel with too many pockets, all of them full. Part of a gathering outfit.',
  artisans_apron: 'A scorched, well-loved apron. Part of a crafting outfit.'
};
for (const tier of [1, 2, 3, 4, 5]) for (const f of FAMILIES as any[]) {
  const m = MATERIALS[f.mat][tier]; if (!m) continue;
  const gen = `${m.key}_${f.type}`; const id = (OVERRIDES[gen] && OVERRIDES[gen].id) || gen;
  if (ITEM_LORE[id]) continue;
  ITEM_LORE[id] = NAMED_LORE[id] || `${TYPE_LORE[f.type] || ''} ${MAT_LORE[m.key] || ''}`.trim();
}
void TIERS_LIVE;
