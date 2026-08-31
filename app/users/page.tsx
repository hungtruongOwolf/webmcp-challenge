import { redirect } from "next/navigation";

// The directory is a modal in the Glass Messenger shell now, not a route --
// this only exists so the post-sign-in redirect (auth-form.tsx, auth callback)
// has somewhere to land.
const UsersRedirect = () => {
  redirect("/conversations");
};

export default UsersRedirect;
