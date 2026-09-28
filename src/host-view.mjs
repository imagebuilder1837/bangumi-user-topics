const userPath =
  /^\/user\/([^/]+)(?:\/(blog|index|friends|rev_friends|timeline|mono|groups|wiki)(?:\/[^/]+)*\/?)?$/;
const collectionPath =
  /^\/(anime|book|music|game|real)\/list\/([^/]+)(?:\/(wish|collect|do|on_hold|dropped))?\/?$/;
const css = `
[data-user-topics-active="on"] > #headerProfile + .mainWrapper > :not(#footer):not(#footer ~ *):not([data-user-topics-view]),
[data-user-topics-active="on"] > #headerProfile > .subjectNav > .navSubTabsWrapper[data-user-topics-original-subnav="on"] { display: none !important; }
[data-user-topics-active="on"] { min-width: 0 !important; }
[data-user-topics-active="on"] > #headerProfile + .mainWrapper { width: 100% !important; max-width: 1200px !important; min-width: 0 !important; margin: 0 auto !important; padding: 0 12px !important; box-sizing: border-box !important; }
[data-user-topics-active="on"] > #headerNeue2 { min-width: 0 !important; }
[data-user-topics-view] { width: 100%; max-width: 750px; margin: 0 auto; padding-top: 10px; min-height: 200px; box-sizing: border-box; }
[data-user-topics-view] > .flex-center-v { flex-wrap: wrap; column-gap: 12px; }
[data-user-topics-view] > .flex-center-v > [role="status"] { min-width: 0; max-width: 100%; margin-left: auto; overflow-wrap: anywhere; text-align: right; }
[data-user-topics-view] .entry-list .item { display: flex; }
`;

// Takeover-level verification: everything hiding and restoring the host
// content depends on. Runs at activation time, not at entry insertion, so a
// failed check can surface visibly instead of silently hiding the entry.
// The takeover does not enumerate known page shapes: any page that offers a
// .mainWrapper body with a #footer boundary can be taken over safely, and
// everything before the footer is hidden and later restored as a whole.
export function verifyTakeover(window) {
  const base = locateProfile(window);
  if (!base) return null;
  const main = base.profile.nextElementSibling;
  // Sibling components may insert bars next to the columns; locate the
  // columns semantically instead of assuming it is the first child.
  const columns = main?.querySelector(":scope > .columns");
  const footer = main?.querySelector(":scope > #footer");
  // Components may add their own subnavigation wrappers; the first wrapper
  // that actually carries a subnavigation list is captured for hiding, extra
  // wrappers are tolerated and left visible.
  const originalSub = [
    ...base.profile.querySelectorAll(
      ":scope > .subjectNav > .navSubTabsWrapper",
    ),
  ].find((wrapper) => wrapper.querySelector(":scope > .navSubTabs"));
  if (
    !main?.matches(".mainWrapper") ||
    !columns ||
    !footer ||
    footer.parentElement !== main
  )
    return null;
  return { ...base, columns, footer, originalSub: originalSub || null };
}

function locateProfile(window) {
  const { document, location } = window;
  if (
    !["bgm.tv", "bangumi.tv", "chii.in"].includes(location.hostname) ||
    location.protocol !== "https:"
  )
    return null;
  const userMatch = userPath.exec(location.pathname);
  const collectionMatch = collectionPath.exec(location.pathname);
  if (!userMatch && !collectionMatch) return null;
  const rawKey = userMatch?.[1] || collectionMatch[2];
  let user;
  try {
    user = decodeURIComponent(rawKey);
  } catch {
    return null;
  }
  if (!user || !/^[\p{L}\p{N}_-]+$/u.test(user)) return null;
  const wrapper = document.querySelector("#wrapperNeue");
  const profile = wrapper?.querySelector(":scope > #headerProfile");
  const subjectNav = profile?.querySelector(":scope > .subjectNav");
  const navWrapper = subjectNav?.querySelector(":scope > .navTabsWrapper");
  const nav = navWrapper?.querySelector(":scope > .navTabs");
  const blogs = [...(nav?.children || [])].filter((li) => {
    if (li.dataset?.userTopicsLink !== undefined) return false;
    if (li.tagName !== "LI" || !li.firstElementChild?.matches("a[href]"))
      return false;
    const url = new URL(li.firstElementChild.href);
    return (
      url.origin === location.origin &&
      /^\/user\/[^/]+\/blog\/?$/.test(url.pathname)
    );
  });
  if (blogs.length !== 1) return null;
  const blog = blogs[0].firstElementChild;
  if (new URL(blog.href).pathname.split("/")[2] !== rawKey) return null;
  const header = profile?.querySelector("h1 .name > a");
  if (
    !wrapper ||
    !wrapper.contains(document.querySelector("#headerNeue2")) ||
    !subjectNav ||
    !navWrapper ||
    !nav ||
    !header
  )
    return null;
  return {
    wrapper,
    profile,
    subjectNav,
    navWrapper,
    nav,
    blog,
    user,
    nickname: header.textContent.trim(),
  };
}

// Entry-level inspection: only what inserting the navigation entry needs.
// Entry appearance is path-scoped and does not depend on takeover checks.
export function inspectEntry(window) {
  return locateProfile(window);
}

export function createHostView(window, host) {
  const { document } = window;
  const style = document.createElement("style");
  style.dataset.userTopicsStyle = "";
  style.textContent = css;
  let root = null,
    subnav = null,
    focus = null,
    previousScroll = null,
    previousFocus = null,
    previousMarker = null,
    markerOwned = false,
    focusOwned = false,
    subnavMarkerOwned = false,
    previousSubnavMarker = null;
  const markerObserver = new window.MutationObserver(() => {
    markerOwned = false;
  });
  const focusObserver = new window.MutationObserver(() => {
    focusOwned = false;
  });
  const subnavObserver = new window.MutationObserver(() => {
    subnavMarkerOwned = false;
  });
  function show() {
    if (root) return { root, subnav };
    previousScroll = window.scrollY;
    previousFocus = host.columns.contains(document.activeElement)
      ? document.activeElement
      : null;
    focus = host.nav.querySelector(":scope > li > a.focus");
    if (focus) {
      focus.classList.remove("focus");
      focusOwned = true;
      focusObserver.observe(focus, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    previousMarker = host.wrapper.getAttribute("data-user-topics-active");
    host.wrapper.dataset.userTopicsActive = "on";
    markerOwned = true;
    markerObserver.observe(host.wrapper, {
      attributes: true,
      attributeFilter: ["data-user-topics-active"],
    });
    if (host.originalSub) {
      previousSubnavMarker = host.originalSub.getAttribute(
        "data-user-topics-original-subnav",
      );
      host.originalSub.dataset.userTopicsOriginalSubnav = "on";
      subnavMarkerOwned = true;
      subnavObserver.observe(host.originalSub, {
        attributes: true,
        attributeFilter: ["data-user-topics-original-subnav"],
      });
    }
    document.head.append(style);
    subnav = document.createElement("div");
    subnav.className = "navSubTabsWrapper";
    subnav.dataset.userTopicsSubnav = "";
    (host.originalSub || host.nav.parentElement).after(subnav);
    root = document.createElement("section");
    root.dataset.userTopicsView = "";
    host.footer.before(root);
    return { root, subnav };
  }
  function hide() {
    if (!root) return;
    const active = document.activeElement;
    const releaseFocus =
      active === document.body ||
      root.contains(active) ||
      subnav.contains(active) ||
      active === host.nav.querySelector("[data-user-topics-link] a");
    root.remove();
    subnav.remove();
    root = subnav = null;
    if (markerObserver.takeRecords().length) markerOwned = false;
    markerObserver.disconnect();
    if (focusObserver.takeRecords().length) focusOwned = false;
    focusObserver.disconnect();
    if (subnavObserver.takeRecords().length) subnavMarkerOwned = false;
    subnavObserver.disconnect();
    style.remove();
    if (
      subnavMarkerOwned &&
      host.originalSub?.dataset.userTopicsOriginalSubnav === "on"
    ) {
      if (previousSubnavMarker === null)
        delete host.originalSub.dataset.userTopicsOriginalSubnav;
      else
        host.originalSub.setAttribute(
          "data-user-topics-original-subnav",
          previousSubnavMarker,
        );
    }
    subnavMarkerOwned = false;
    if (
      focusOwned &&
      focus?.isConnected &&
      !host.nav.querySelector(":scope > li > a.focus")
    )
      focus.classList.add("focus");
    focusOwned = false;
    if (markerOwned && host.wrapper.dataset.userTopicsActive === "on") {
      if (previousMarker === null) delete host.wrapper.dataset.userTopicsActive;
      else host.wrapper.setAttribute("data-user-topics-active", previousMarker);
    }
    markerOwned = false;
    if (
      releaseFocus &&
      previousFocus?.isConnected &&
      host.columns.contains(previousFocus)
    )
      previousFocus.focus();
    previousFocus = null;
    const hash = window.location.hash.slice(1);
    const nativeAnchor = hash && document.getElementById(hash);
    if (
      !nativeAnchor &&
      previousScroll != null &&
      typeof window.scrollTo === "function"
    ) {
      try {
        window.scrollTo(0, previousScroll);
      } catch {
        /* jsdom has no scroll implementation */
      }
    }
  }
  function intact() {
    if (!root || root.parentElement !== host.footer.parentElement) return false;
    // Nodes inserted between the root and the footer stay hidden by the
    // takeover CSS, so only the relative order matters, not adjacency.
    return (
      !!(
        root.compareDocumentPosition(host.footer) &
        window.Node.DOCUMENT_POSITION_FOLLOWING
      ) && subnav?.parentElement === host.nav.parentElement.parentElement
    );
  }
  return { show, hide, intact };
}
