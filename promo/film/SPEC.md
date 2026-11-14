GOAL:    the viewer thinks "my feed is full of that" and visits the site to add the extension
OUTPUT:  HyperFrames, 1920 x 1080, 30 fps, MP4 + poster
TIME:    46 s x 30 = 1380 frames
LOOK:    ground #f3f2ef (the demo feed's own grey), cards #fff radius 24 shadow 0 2px 0 rgba(0,0,0,.06);
         ink #1d1d1f, muted #6e6e73; redaction bars #111 radius 6;
         accent: brand red gradient #ff6b5e -> #e5302a, only on the word "slop." and the end card;
         display: Inter 900, 150-170 px headline, 64 px captions, tracking -2%; body: Inter 400 52 px in the hook card;
         medium: the product's own UI (recorded with the real extension) and a feed rebuilt as type
OBJECTS: feed post card (avatar circle, name, role, lines, action row); redaction bar; the real popup;
         a big white cursor with black outline, 64 px
MOTION:  enter power3.out 0.5 s; camera moves power2.inOut 0.8-1.2 s; bars slam expo.out 0.18 s, stagger 0.035 s;
         cursor moves power2.inOut 0.6 s, click = scale 0.85 for 4 frames
SHOTS:   0-3.8   hook card, lines arrive 0.7 s apart                       -> camera pulls back
         3.8-9   pull back to a wall of 16 slop cards, wall drifts up        -> bars
         9-11    black bars slam over every slop line                       -> push into clear strip
         11-14   "Slop is slop." + "Anti-Slop folds it out of your feed."    -> cut to feed
         14-22.5 real footage: feed with extension switched on, slop folds   -> punch in on a fold
         22.5-28.5 punch-in on the fold's reason; cursor clicks Show; post returns
         28.5-34 real popup: cursor drags strictness 3 -> 8
         34-40   real cleaned feed scrolls; "Your feed, written by people." + the four sites
         40-46   claim, then a bar turns into the icon; name; CTA + URL hold 2.5 s
BANNED:  dark void; glow; purple/blue gradients; glass; cream paper + serif; everything centred; fade-and-slide-up on
         everything; three cards in a row; docked logo; pill chips; invented UI (all product UI is recorded)
QA:      frames 1.0, 6.0, 10.0, 12.5, 17.5, 25.5, 31.0, 37.0, 41.0, 45.0
