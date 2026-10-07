const userPath =
  /^\/user\/([^/]+)(?:\/(blog|index|friends|rev_friends|timeline|mono|groups|wiki)(?:\/[^/]+)*\/?)?$/;
const collectionPath =
  /^\/(anime|book|music|game|real)\/list\/([^/]+)(?:\/(wish|collect|do|on_hold|dropped))?\/?$/;
const css = `
[data-user-topics-main="on"] > :not([data-user-topics-footer="on"]):not([data-user-topics-footer="on"] ~ *):not([data-user-topics-view]),
[data-user-topics-original-subnav="on"] { display: none !important; }
[data-user-topics-active="on"], [data-user-topics-header="on"] { min-width: 0 !important; }
[data-user-topics-main="on"] { width: 100% !important; max-width: 1200px !important; min-width: 0 !important; margin: 0 auto !important; padding: 0 12px !important; box-sizing: border-box !important; }
[data-user-topics-view] { width: 100%; max-width: 750px; margin: 0 auto; padding-top: 10px; min-height: 200px; box-sizing: border-box; }
[data-user-topics-view] > .flex-center-v { flex-wrap: wrap; justify-content: flex-start; column-gap: .6em; }
[data-user-topics-view] > .flex-center-v > [role="status"] { color: #999; min-width: 0; max-width: 100%; overflow-wrap: anywhere; text-align: left; }
[data-user-topics-view] .entry-list .item { display: flex; }
`;

// null means this is not a recognizable, in-scope personal page. A failure
// carries a live personal navigation anchor and the first blocking reason.
export function verifyTakeover(window) {
  const base = inspectEntry(window);
  if (!base || base.failure) return base;
  const scope = base.wrapper || base.profile.parentElement;
  const mains = [...scope.querySelectorAll(".mainWrapper")].filter(
    (main) =>
      !main.contains(base.profile) &&
      !base.profile.contains(main) &&
      !!(
        base.profile.compareDocumentPosition(main) &
        window.Node.DOCUMENT_POSITION_FOLLOWING
      ),
  );
  const boundaries = mains.flatMap((main) =>
    [...main.querySelectorAll(":scope > #footer")].map((footer) => ({
      main,
      footer,
    })),
  );
  let reason;
  if (!mains.length) reason = "未找到可挂载的正文容器。";
  else if (!boundaries.length) reason = "未找到正文中的 footer 挂载边界。";
  else if (boundaries.length !== 1)
    reason = "正文存在多个 footer 挂载边界，无法确定挂载位置。";
  if (reason)
    return { failure: { nav: base.nav, navMount: base.navMount, reason } };
  const originalSub = [
    ...base.profile.querySelectorAll(".navSubTabsWrapper"),
  ].find(
    (node) =>
      !node.hasAttribute("data-user-topics-error") &&
      !node.hasAttribute("data-user-topics-subnav") &&
      !node.contains(base.nav) &&
      !base.nav.contains(node) &&
      node.querySelector(":scope > .navSubTabs"),
  );
  return { ...base, ...boundaries[0], originalSub: originalSub || null };
}

export function inspectEntry(window) {
  const { document, location } = window;
  if (
    !["bgm.tv", "bangumi.tv", "chii.in"].includes(location.hostname) ||
    location.protocol !== "https:"
  )
    return null;
  const userMatch = userPath.exec(location.pathname);
  const collectionMatch = collectionPath.exec(location.pathname);
  if (!userMatch && !collectionMatch) return null;
  const profile = document.querySelector("#headerProfile");
  const nav = profile?.querySelector(".navTabs");
  if (!nav) return null;
  const navWrapper = nav.closest(".navTabsWrapper");
  const navMount =
    navWrapper && profile.contains(navWrapper) ? navWrapper : nav;
  const fail = (reason) => ({ failure: { nav, navMount, reason } });
  const rawKey = userMatch?.[1] || collectionMatch[2];
  let user;
  try {
    user = decodeURIComponent(rawKey);
  } catch {
    return fail("页面中的用户 key 无法解码。");
  }
  if (!user || !/^[\p{L}\p{N}_-]+$/u.test(user))
    return fail("页面中的用户 key 不适用于用户查询。");
  const blogs = [...nav.querySelectorAll(":scope > li > a[href]")].filter(
    (anchor) => {
      if (anchor.parentElement.hasAttribute("data-user-topics-link"))
        return false;
      try {
        const url = new URL(anchor.href);
        return (
          url.origin === location.origin &&
          /^\/user\/[^/]+\/blog\/?$/.test(url.pathname)
        );
      } catch {
        return false;
      }
    },
  );
  if (!blogs.length) return fail("个人导航中未找到目标用户的日志链接。");
  try {
    if (
      blogs.some(
        (anchor) =>
          decodeURIComponent(new URL(anchor.href).pathname.split("/")[2]) !==
          user,
      )
    )
      return fail("个人导航中的日志链接与页面目标用户身份冲突。");
  } catch {
    return fail("个人导航中的日志链接用户 key 无法解码。");
  }
  const blog = blogs[0];
  const name = profile.querySelector("h1 .name");
  const nicknameLink = [
    ...(name?.querySelectorAll(":scope > a[href]") || []),
  ].find((anchor) => {
    try {
      const url = new URL(anchor.href);
      const match = /^\/user\/([^/]+)\/?$/.exec(url.pathname);
      return (
        url.origin === location.origin &&
        match &&
        decodeURIComponent(match[1]) === user
      );
    } catch {
      return false;
    }
  });
  const nickname =
    nicknameLink?.textContent.trim() ||
    [...(name?.childNodes || [])]
      .filter((node) => node.nodeType === window.Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join("")
      .trim() ||
    user;
  return {
    wrapper: profile.closest("#wrapperNeue"),
    profile,
    nav,
    navMount,
    blog,
    user,
    nickname,
  };
}

// Observers below only relinquish restoration ownership after external writes.
// They never inspect host structure, exit the view or trigger a new takeover.
function ownAttribute(window, node, name) {
  if (!node) return () => {};
  const previous = node.getAttribute(name);
  node.setAttribute(name, "on");
  let owned = true;
  const observer = new window.MutationObserver(() => {
    owned = false;
  });
  observer.observe(node, { attributes: true, attributeFilter: [name] });
  return () => {
    if (observer.takeRecords().length) owned = false;
    observer.disconnect();
    if (!owned || node.getAttribute(name) !== "on") return;
    if (previous === null) node.removeAttribute(name);
    else node.setAttribute(name, previous);
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
    hiddenContent = [],
    releases = [],
    focusOwned = false;
  const focusObserver = new window.MutationObserver(() => {
    focusOwned = false;
  });
  function show() {
    if (root) return;
    previousScroll = window.scrollY;
    hiddenContent = [...host.main.children].slice(
      0,
      [...host.main.children].indexOf(host.footer),
    );
    previousFocus = hiddenContent.some((node) =>
      node.contains(document.activeElement),
    )
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
    releases = [
      ownAttribute(window, host.wrapper, "data-user-topics-active"),
      ownAttribute(
        window,
        host.wrapper?.querySelector("#headerNeue2"),
        "data-user-topics-header",
      ),
      ownAttribute(window, host.main, "data-user-topics-main"),
      ownAttribute(window, host.footer, "data-user-topics-footer"),
      ownAttribute(
        window,
        host.originalSub,
        "data-user-topics-original-subnav",
      ),
    ];
    document.head.append(style);
    subnav = document.createElement("div");
    subnav.className = "navSubTabsWrapper";
    subnav.dataset.userTopicsSubnav = "";
    (host.originalSub || host.navMount).after(subnav);
    root = document.createElement("section");
    root.dataset.userTopicsView = "";
    host.footer.before(root);
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
    if (focusObserver.takeRecords().length) focusOwned = false;
    focusObserver.disconnect();
    style.remove();
    for (const release of releases) release();
    releases = [];
    if (
      focusOwned &&
      focus?.isConnected &&
      !host.nav.querySelector(":scope > li > a.focus")
    )
      focus.classList.add("focus");
    focusOwned = false;
    if (
      releaseFocus &&
      previousFocus?.isConnected &&
      host.main.contains(previousFocus) &&
      hiddenContent.some((node) => node.contains(previousFocus))
    )
      previousFocus.focus();
    previousFocus = null;
    hiddenContent = [];
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
  return {
    show,
    hide,
    get root() {
      return root;
    },
    get subnav() {
      return subnav;
    },
  };
}
