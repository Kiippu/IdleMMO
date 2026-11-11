// Open the one shared item sheet (ItemSheet.svelte, mounted in App) for any item, from anywhere.
export type ItemRef = { itemId: string; /** gear instance in your bag or the vault */ uid?: string; readOnly?: boolean };
export const itemSheet = $state<{ ref: ItemRef | null }>({ ref: null });
export const openItem = (ref: ItemRef) => { itemSheet.ref = ref; };
export const closeItem = () => { itemSheet.ref = null; };
