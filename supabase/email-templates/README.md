# Email templates

Branded versions of the three emails MonthLens accounts send. Supabase's defaults are plain and unbranded.

In Supabase: **Authentication → Emails → Templates**. For each template, set the subject and paste the file's contents into the body.

| Supabase template | Subject | File |
| --- | --- | --- |
| Confirm signup | Confirm your MonthLens account | `confirm-signup.html` |
| Reset Password | Reset your MonthLens password | `reset-password.html` |
| Magic Link | Your MonthLens sign-in link | `magic-link.html` |

`{{ .ConfirmationURL }}` is filled in by Supabase. Leave it exactly as written.
