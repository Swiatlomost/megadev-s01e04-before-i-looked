# Digest preview on GitHub Pages

The preview is a **public report**: anyone with the URL can read the sample data and, in
review mode, the lane marker. Review the data and destination first. A human must explicitly
approve the host and the first publication separately; preparing or merging this workflow is
not approval. A human must enable GitHub Pages with GitHub Actions as its source first.

After approval, run **Actions → Publish preview → Run workflow**, select the intended branch,
choose `review`, and enter the lane marker in `lane_marker`. Do not put the marker in issues,
chat attachments, or the repository. The workflow exports only the digest for 2026-10-28;
the deployment step provides the HTTPS URL. Verify the public page, its data and banner,
and send the URL and plan issues to the reviewer. Keep evidence privately.

Once review is complete and a human approves the cleanup, run the same workflow on the same
repository with `mode: clean`. The marker input is ignored. This replaces the deployment at
the same URL with a page whose banner says “no marker set”. Verify the public response no
longer contains the marker; allow for caching. This cleanup does not itself complete the plan.

To withdraw the preview altogether, a repository administrator can disable GitHub Pages in
repository Settings → Pages. Verify that the URL is no longer publicly available, accounting
for caches. Disabling Pages may affect other content hosted by the repository; coordinate with
the owner. A clean deployment removes the marker but the sample report remains public.
