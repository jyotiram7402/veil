/**
 * Class list for the tall, soft text field used on the entry screens.
 * Text stays 16px at every width so iOS never zooms into the field.
 */
export const ENTRY_FIELD =
  "h-[3.25rem] rounded-2xl border-transparent bg-muted px-4 text-base sm:text-base shadow-none " +
  "placeholder:text-muted-foreground focus-visible:ring-offset-0 aria-[invalid=true]:border-destructive";

/** Class list for the big pill button that submits an entry form. */
export const ENTRY_SUBMIT = "h-14 w-full text-[1.0625rem] font-bold [&_svg]:size-5";
