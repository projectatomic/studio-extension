# Release process for Podman AI Lab

## Pre-requisites

- Create Enhancement Issue `Release vX.X.X` for the current sprint, and assign it to yourself.
- Confirm with maintainers that pending / need-to-go-in PR's have been merged.
- Notify main contributors on Discord / Slack.

In the below example, we will pretend that we're upgrading from `1.1.0` to `1.2.0`. Please use the CORRECT release numbers as these are just example numbers.

## Release timeline

When AI Lab is released at the same time as Podman Desktop, this is what a typical release week may look like:

- **Monday (Notify):** 48-hour notification. Communicate to maintainers and public channels a release will be cut on Wednesday and to merge any pending PRs. Inform QE team. Start work on blog post as it is usually the longest part of the release process.
- **Tuesday (Staging, Testing & Blog):** Stage the release (see instructions below) to create a new cut of the release to test. Test the pre-release (master branch) build briefly. Get feedback from committers (if applicable). Push the blog post for review (as it usually takes a few back-and-forth reviews on documentation).
- **Wednesday (Release):** Publish the new release on the catalog using the below release process. 
- **Thursday (Post-release Testing & Blog):** Test the post-release build briefly for any critical bugs. Confirm that new release has been pushed to the catalog. Push the blog post live. Get a known issues list together from QE and publish to the Podman Desktop Discussions, link to this from the release notes.
- **Friday (Communicate):** Friday is statistically the best day for new announcements. Post on internal channels. Post on reddit, hackernews, twitter, etc.

## Releasing on GitHub

1. Go to https://github.com/containers/podman-desktop-extension-ai-lab/actions/workflows/release.yaml.
1. Click on the top right drop-down menu `Run workflow`.
1. Enter the name of the release. Example: `1.2.0` (DO NOT use the v prefix like v1.2.0)
1. Specify the branch to use for the new release. It's main for all major releases. For a bugfix release, you'll select a different branch.
1. Click on the `Run workflow` button.
1. Note: `Run workflow` takes approximately 2-3 minutes.
1. Make sure that all tasks for the respective release milestone are completed / updated, then close it. https://github.com/containers/podman-desktop-extension-ai-lab/milestones
1. If not already created, click on `New Milestone` and create a new milestone for the NEXT release.
1. Check that https://github.com/containers/podman-desktop-extension-ai-lab/actions/workflows/release.yaml has been completed.
1. Ensure the image has been successfully published to https://github.com/containers/podman-desktop-extension-ai-lab/pkgs/container/podman-desktop-extension-ai-lab.
1. There should be an automated PR that has been created. The title looks like `chore: 📢 Bump version to 1.3.0`. Rerun workflow manually if some of e2e tests are failing.
1. Wait for the PR above to be approved and merged before continuing with the steps.
1. Edit the new release https://github.com/containers/podman-desktop-extension-ai-lab/releases/edit/v1.2.0.
1. Select previous tag (v1.1.0) and click on `Generate release notes` and then click on `Update release`.

## Release testing

At this stage the release is not in the catalog, so clients will not automatically update to this version.

This allows QE (and everyone else) to test the release before it goes live.

❌ All severe bugs and regressions are investigated and discussed. If we agree any should block the release, we need to fix the bugs and do a respin of the release with a new .z release like 1.2.1 instead of 1.2.0.

- Create a branch if it does not exist. For example 1.2.1 if 1.2.0 failed. Then, cherry-pick bugfixes into that branch.

✅ If committers agree we have a green light, proceed.

## Publishing and updating the catalog

All steps above must be complete and successful before proceeding, including verifying the published images, testing, and green light!

1. Change the release in GitHub from 'pre-release' to 'latest release'.
1. Create and submit a PR to the catalog (https://github.com/containers/podman-desktop-catalog on branch gh-pages). This is manual and will be automated in the future.
