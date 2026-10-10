import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Themed dropdown (replaces the native <select>).
 *
 *   <Select value={status} onChange={setStatus} options={[{ value: 'draft', label: 'Draft' }]} />
 *
 * size="md" matches the form inputs; size="sm" is a compact pill for inline status changes.
 * Pass `triggerClassName` to tint the trigger (e.g. status colours).
 */
const Select = React.forwardRef(function Select(
  { value, onChange, options, size = "md", placeholder, triggerClassName, className, "aria-label": ariaLabel, disabled },
  ref
) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        ref={ref}
        aria-label={ariaLabel}
        className={cn(
          "group inline-flex w-full items-center justify-between gap-2 rounded-sm border border-border bg-white text-left text-foreground",
          "transition-colors hover:border-foreground/40 focus:outline-none focus-visible:border-accent data-[state=open]:border-accent",
          "disabled:cursor-not-allowed disabled:opacity-60",
          size === "sm" ? "h-7 w-auto px-2 text-xs font-medium" : "h-[42px] px-3 text-sm",
          triggerClassName,
          className
        )}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            className={cn(
              "shrink-0 opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180",
              size === "sm" ? "h-3 w-3" : "h-4 w-4"
            )}
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className={cn(
            "z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-sm border border-border bg-white shadow-[0_12px_32px_-12px_rgba(11,16,24,0.25)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1"
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-[2px] py-2 pl-8 pr-3 text-foreground outline-none",
                  "data-[highlighted]:bg-accent/10 data-[highlighted]:text-accent data-[state=checked]:font-semibold",
                  size === "sm" ? "text-xs" : "text-sm"
                )}
              >
                <span className="absolute left-2.5 flex h-4 w-4 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-3.5 w-3.5 text-accent" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
})

export { Select }
