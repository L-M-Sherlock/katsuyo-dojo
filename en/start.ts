import { loadUsageCardLocale } from "../app/lib/i18n/usage-card-locales.mjs";
import "../app/globals.css";

// Start the optional English download before the shared application runs.
// The practice screen handles loading errors and offers a retry.
void loadUsageCardLocale("en").catch(() => undefined);
void import("../main");
