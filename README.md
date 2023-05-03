# Media Viewer
A self-hosted, portable Electron app for indexing and viewing media files featuring hierarchical tags as well as several features inspired by cloud storage providers that are missing from Windows File Explorer and most contemporary alternatives. It has been refined over several iterations with the primary goal of optimizing performance at scale and the UX of batch workflows.

*This project is made public as a demonstration of skills and style, but is not intended for public use. A pre-configured demo executable is available from the releases page with instructions for building your own distribution, but I have also provided a structured series of short demo clips below for convenience.*

## Demos
Import files or entire folders using drag-and-drop or the buttons in the import manager. Pending imports display original path, which opens original file location when clicked, while completed / duplicate imports show the MD5 hash of the imported file, which opens the Carousel window when clicked. Static or animated thumbnails are generated depending on file type.
> <video src="https://raw.githubusercontent.com/msihly/Media-Viewer/master/_readme/Importing.mp4" autoplay loop controls muted />

Add or remove tags to and from a batch of imported files or the currently selected files by clicking the tag buttons or pressing 'T'. Create or edit tags from multiple places for different workflows, including batch creation with the 'Continue' options.
> <video src="https://raw.githubusercontent.com/msihly/Media-Viewer/master/_readme/Tagging.mp4" autoplay loop controls muted />

Filter files by tag inclusion / exclusion (optionally with their descendants) with alias support, tagged / untagged / either, and file types.
> <video src="https://raw.githubusercontent.com/msihly/Media-Viewer/master/_readme/Filtering.mp4" autoplay loop controls muted />

Sort files by common media attributes.
> <video src="https://raw.githubusercontent.com/msihly/Media-Viewer/master/_readme/Sorting.mp4" autoplay loop controls muted />

Select files by single-, ctrl-, or shift-clicking; dragging; or the 'Select All' (on screen) and 'Deselect All' buttons on the top bar.
> <video src="https://raw.githubusercontent.com/msihly/Media-Viewer/master/_readme/Selecting.mp4" autoplay loop controls muted />

Press the numbers 1-9 with a single file selected or in the Carousel viewer to change a file's rating.
> <video src="https://raw.githubusercontent.com/msihly/Media-Viewer/master/_readme/Rating.mp4" autoplay loop controls muted />

Double-click a file to open the Carousel window with custom image viewer and media player support for all supported file types. Changes to file ratings and tags are synced between all windows.
> <video src="https://raw.githubusercontent.com/msihly/Media-Viewer/master/_readme/Carousel.mp4" autoplay loop controls muted />

Hover over file info tooltip for quick summary or right-click to access extended info from context-menu. Open files using native program or open their containing folder in File Explorer.
> <video src="https://raw.githubusercontent.com/msihly/Media-Viewer/master/_readme/Context Menu.mp4" autoplay loop controls muted />

Archive or permanently delete files.
> <video src="https://raw.githubusercontent.com/msihly/Media-Viewer/master/_readme/Deleting.mp4" autoplay loop controls muted />

Search through tags with different depths of recursion for descendant tags.
> <video src="https://raw.githubusercontent.com/msihly/Media-Viewer/master/_readme/Tag Manager.mp4" autoplay loop controls muted />