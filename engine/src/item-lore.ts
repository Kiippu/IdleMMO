// Draft descriptions for owner review (2026-11-11)
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
  training_sword: "A plain practice blade. Everyone's first, and good enough for the wolves at the town edge.",
  pine_shortbow: "A light pine bow with a gentle pull. A friendly first weapon for new strikers.",
  bronze_sword: "A neat bronze blade with a leather-wrapped grip. A solid step up from the training sword.",
  leather_cap: "A snug leather cap with copper rivets. Helps strikers spot better drops, too.",
  leather_jerkin: "A plain leather jerkin. Light, quiet, and good for scrambling about.",
  leather_breeches: "Sturdy breeches stitched with linen thread. Comfortable for a long hunt.",
  iron_longsword: "A long, honest iron blade. Reliable damage for anyone getting serious.",
  oak_longbow: "A long oak bow strung with bone-tipped care. Good reach, good pull.",
  studded_jerkin: "Tanned leather studded with rivets. Takes a knock and keeps going.",
  studded_leggings: "Tough studded leggings made for hunters. Good for gathering better trophies.",
  frostbite_saber: "A pale steel saber with a chill to it. Strong against fire-wielding foes.",
  venomstring_bow: "A yew bow strung with silk and bloodmoss. Poisonous, and not for the squeamish.",
  hardened_hood: "A close-fitting hood of boiled leather. Light, tough, and keen on hunting.",
  hardened_brigandine: "Hardened leather reinforced with steel plates. A striker's armour, built to last.",
  emberbrand: "A mithril blade glowing like a coal. Burns hot, and loves frost-skinned foes.",
  dawnstring_greatbow: "A tall greatbow with a golden string. Holy light travels with every arrow.",
  drakeskin_leggings: "Supple, scaled leggings that hold up to bites and brambles alike.",
  drakeskin_coat: "A glossy green coat of drakeskin. The finest light armour in town.",

  // gear: guardians
  pine_buckler: "A small round shield of pine. It'll stop a rat, and a few harder things.",
  copper_helm: "A rivet-studded copper helm. Dented already, and loved all the same.",
  bronze_mace: "A knobbly bronze mace. Light enough to swing, heavy enough to be noticed.",
  bronze_chainmail: "Rows of tiny links stitched to leather. Tiring to make, comforting to wear.",
  oak_kite_shield: "A tall oak shield bound with iron. Good for standing your ground.",
  iron_greaves: "Iron leg guards. Clank a bit, but shrug off a lot.",
  iron_warhammer: "A hefty iron hammer with an oak haft. Solid for a guardian who hits back.",
  steel_greathelm: "A proper steel greathelm with a linen lining. Heavy, but heads stay put.",
  steel_cuirass: "A gleaming steel breastplate. Takes a lot of metal, and a lot of hits.",
  yew_tower_shield: "A big yew shield rimmed with steel. A wall you can carry.",
  stoneheart_maul: "A maul set with a golem's heart. Thuds like a falling hillside.",
  mithril_greaves: "Light mithril leg guards. Quiet, strong and surprisingly comfortable.",
  drakescale_aegis: "A shield of ironwood and drake scale. Dragon fire gives it a hard time.",
  mithril_plate: "A breastplate of mithril and drake scale. The finest armour a guardian can wear.",

  // gear: menders
  padded_tunic: "A soft padded tunic. Plain, warm, and kind to the backs of the tired.",
  pine_staff: "A light pine staff with a spark of essence. A fine first staff for a mender.",
  linen_hood: "A soft linen hood. Handy for foraging and keeping the sun off.",
  linen_robe: "A simple linen robe. Plain, breathable and easy to wash.",
  oak_staff: "A solid oak staff set with a glowing essence. A steady upgrade for healers.",
  canvas_trousers: "Rugged nettle-canvas trousers. Fine for foraging through brambles.",
  nettle_robe: "A hardy green robe of nettle canvas. Scratchy at first, devoted after a week.",
  herbalist_cowl: "A green cowl with a pocket of bloodmoss. Good for a keen forager.",
  dawnward_staff: "A yew staff topped with storm essence and silver. Healing, with a holy glow.",
  silk_cowl: "A light silk cowl. Soft, and good for steadier crafting hands.",
  silk_trousers: "Smooth silk trousers reinforced at the knee. Elegant, and tougher than they look.",
  silk_robe: "A flowing silk robe with a storm-essence trim. A proper mender's robe.",
  moonweave_hood: "A hood of woven moonlight. Shimmers softly when the healing starts.",
  moonweave_vestment: "A shimmering vestment of moonweave and drakeskin. The finest healer's garb in town.",
  moonheart_staff: "An ironwood staff with a black pearl and moon essence. Healing, held in hand.",

  // gear: rings
  copper_band: "A simple copper ring. Cheap and cheerful, and a little lucky for miners.",
  gemstone_ring: "A bronze ring with a rough gem. Crude, but good for a steady hand.",
  glowstone_ring: "A ring that glows faintly in the dark. Popular with foragers.",
  iron_signet: "A heavy iron signet ring. Good for guardians who dig a bit on the side.",
  pearl_ring: "A silver ring set with a river pearl. Calming to wear, and good luck for anglers.",
  sapphire_signet: "A silver signet with a deep blue stone. Dignified and sturdy.",
  ruby_warband: "A gold band with a blazing ruby. Strikers wear it with a grin.",
  black_pearl_ring: "A mithril ring with a black pearl and a moon-lit shine. A healer's treasure.",

  // gear: tools and clothing
  copper_pickaxe: "A copper-headed pickaxe. Speeds up your digging, and doubles as a poor weapon.",
  bronze_hatchet: "A bronze hatchet for lumberjacks. Chops cleaner than your granddad's.",
  iron_pickaxe: "A tough iron pickaxe. Seams give up their ore a little faster.",
  iron_felling_axe: "A broad iron axe. Trees go down with fewer swings.",
  foragers_satchel: "A linen satchel with plenty of pockets. Helps you find more along the way.",
  anglers_hat: "A floppy linen hat full of old hooks. Fish seem to like it.",
  artisans_apron: "A thick leather apron with many pockets. Neater work, fewer burnt fingers.",
  trappers_leggings: "Tough leggings hung with bone charms. Helps hunters bring home more.",

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
