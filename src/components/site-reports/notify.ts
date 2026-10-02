// Site Reports toasts open top-centre: the app's Toaster sits bottom-right,
// exactly where this tab's Save / Submit bar is, and a toast there covers the
// next tap for several seconds. Same API as sonner's toast().
import { toast, type ExternalToast } from "sonner";

const at = (o?: ExternalToast): ExternalToast => ({ position: "top-center", ...o });

type Msg = Parameters<typeof toast>[0];

export const notify = Object.assign((m: Msg, o?: ExternalToast) => toast(m, at(o)), {
  success: (m: Msg, o?: ExternalToast) => toast.success(m, at(o)),
  error: (m: Msg, o?: ExternalToast) => toast.error(m, at(o)),
});
