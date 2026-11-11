// "How many?" sheet for refine / craft. Opened from the item sheet's Start; QuantitySheet.svelte is mounted inside ItemSheet.
export const quantity = $state<{ actionId: string | null }>({ actionId: null });
export const askQuantity = (actionId: string) => { quantity.actionId = actionId; };
export const closeQuantity = () => { quantity.actionId = null; };
