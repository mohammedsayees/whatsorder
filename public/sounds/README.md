# New order alert sound

The restaurant dashboard first tries to play `/sounds/new-order.mp3`.

WhatsOrder includes a short generated alert sound (MP3, kept small because every dashboard load preloads it). If the file is missing
or a browser blocks playback, the dashboard falls back to a synthesized chime.
