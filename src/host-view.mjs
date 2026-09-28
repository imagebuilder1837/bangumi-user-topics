const userPath = /^\/user\/([^/]+)(?:\/(blog|index|friends))?\/?$/;
const collectionPath =
  /^\/(anime|book|music|game|real)\/list\/([^/]+)(?:\/(wish|collect|do|on_hold|dropped))?\/?$/;
const columnShapes = {
  home: ["columnA", "columnB"],
  blog: ["columnA", "columnB"],
  index: ["columnA", "columnB"],
  friends: ["columnUserSingle"],
  overview: ["columnA", "columnB"],
  state: ["columnSubjectBrowserA", "columnSubjectBrowserB"],
};
const css = `
[data-user-topics-active="on"] > #headerProfile + .mainWrapper > .columns,
[data-user-topics-active="on"] > #headerProfile > .subjectNav > .navSubTabsWrapper[data-user-topics-original-subnav="on"] { display: none !important; }
[data-user-topics-active="on"] { min-width: 0 !important; }
[data-user-topics-active="on"] > #headerProfile + .mainWrapper { width: 100% !important; max-width: 1200px !important; min-width: 0 !important; margin: 0 auto !important; padding: 0 12px !important; box-sizing: border-box !important; }
[data-user-topics-active="on"] > #headerNeue2 { min-width: 0 !important; }
[data-user-topics-view] { width: 100%; max-width: 750px; margin: 0 auto; padding-top: 10px; min-height: 200px; box-sizing: border-box; }
[data-user-topics-view] .entry-list .item { display: flex; }
`;
export function inspectHost(window) {
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
  const shape = userMatch
    ? userMatch[2] || "home"
    : collectionMatch[3]
      ? "state"
      : "overview";
  const wrapper = document.querySelector("#wrapperNeue");
  const profile = wrapper?.querySelector(":scope > #headerProfile");
  const nav = profile?.querySelector(
    ":scope > .subjectNav > .navTabsWrapper > .navTabs",
  );
  const blogs = [...(nav?.children || [])].filter((li) => {
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
  const main = profile?.nextElementSibling;
  const columns = main?.firstElementChild;
  const footer = columns?.nextElementSibling;
  const header = profile?.querySelector("h1 .name > a");
  const subnavs = profile?.querySelectorAll(
    ":scope > .subjectNav > .navSubTabsWrapper",
  );
  const originalSub = subnavs?.[0];
  const evidence = {
    home: "#columnA #user_home",
    blog: "#columnA #entry_list",
    index: "#columnA #timeline.index-list",
    friends: "#columnUserSingle #memberUserList",
    overview: "#columnA .horizontalOptions",
    state: "#columnSubjectBrowserA #browserTools",
  };
  if (
    !wrapper ||
    !wrapper.contains(document.querySelector("#headerNeue2")) ||
    !main?.matches(".mainWrapper") ||
    !columns?.matches(".columns") ||
    !footer?.matches("#footer") ||
    columns.parentElement !== footer.parentElement ||
    !header ||
    !nav ||
    !profile.querySelector(":scope > .subjectNav > .navTabsWrapper") ||
    subnavs.length > 1 ||
    (originalSub && !originalSub.querySelector(":scope > .navSubTabs")) ||
    [...columns.children].map((child) => child.id).join(",") !==
      columnShapes[shape].join(",") ||
    !columns.querySelector(evidence[shape])
  )
    return null;
  return {
    profile,
    nav,
    blog,
    columns,
    footer,
    wrapper,
    user,
    nickname: header.textContent.trim(),
    originalSub,
    bodyEvidence: columns.querySelector(evidence[shape]),
  };
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
    return (
      root?.parentElement === host.footer.parentElement &&
      root.previousElementSibling === host.columns &&
      root.nextElementSibling === host.footer &&
      subnav?.parentElement === host.nav.parentElement.parentElement
    );
  }
  return { show, hide, intact };
}
