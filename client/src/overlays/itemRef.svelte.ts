// Open the one shared item sheet (ItemSheet.svelte, mounted in App) for any item, from anywhere.
export type ItemRef = { itemId: string; /** gear instance in your bag or the vault */ uid?: string; readOnly?: boolean; /** how many identical pieces this row stands for (stacked commons) */ count?: number; /** a Workshop action this tile stands for (gather / refine / craft / fight): the sheet shows its time, XP, inputs and Start */ actionId?: string };
export const itemSheet = $state<{ ref: ItemRef | null }>({ ref: null });
export const openItem = (ref: ItemRef) => { itemSheet.ref = ref; };
export const closeItem = () => { itemSheet.ref = null; };
