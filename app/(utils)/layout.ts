import { useTheme } from "@mui/joy";
import { useMediaQuery } from "@mui/material";
import type { Breakpoint } from "@mui/system";

export function useBreakpoint(value: Breakpoint): boolean {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.up(value));
}
