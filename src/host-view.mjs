const css = `
[data-user-topics-active="on"] > #headerProfile + .mainWrapper > .columns,
[data-user-topics-active="on"] > #headerProfile .navSubTabsWrapper { display: none !important; }
[data-user-topics-active="on"] { min-width: 0 !important; }
[data-user-topics-active="on"] > #headerProfile + .mainWrapper { width: 100% !important; max-width: 1200px !important; min-width: 0 !important; margin: 0 auto !important; padding: 0 12px !important; box-sizing: border-box !important; }
[data-user-topics-active="on"] > #headerNeue2 { min-width: 0 !important; }
[data-user-topics-view] { max-width: 750px; margin: 0 auto; min-height: 200px; }
[data-user-topics-view] .entry-list .item { display: flex; }
`;
export function inspectHost(window) {
  const { document, location } = window;
  if (
    !["bgm.tv", "bangumi.tv", "chii.in"].includes(location.hostname) ||
    location.protocol !== "https:" ||
    !/^\/user\/[^/]+\/blog\/?$/.test(location.pathname)
  )
    return null;
  const profile = document.querySelector("#headerProfile");
  const nav = profile?.querySelector(".navTabs");
  const blogs = [...(nav?.children || [])].filter(
    (li) =>
      li.tagName === "LI" &&
      li.firstElementChild?.matches("a[href]") &&
      new URL(li.firstElementChild.href).origin === location.origin &&
      /^\/user\/[^/]+\/blog\/?$/.test(
        new URL(li.firstElementChild.href).pathname,
      ),
  );
  if (blogs.length !== 1) return null;
  const blog = blogs[0].firstElementChild;
  const key = new URL(blog.href).pathname.split("/")[2];
  let user;
  try {
    user = decodeURIComponent(key);
  } catch {
    return null;
  }
  if (
    !user ||
    !/^[\p{L}\p{N}_-]+$/u.test(user) ||
    location.pathname.split("/")[2] !== key
  )
    return null;
  const columns = document.querySelector(
    "#headerProfile + .mainWrapper > .columns",
  );
  const footer = columns?.parentElement?.querySelector(":scope > #footer");
  const wrapper = document.querySelector("#wrapperNeue");
  const header = profile?.querySelector("h1 .name > a");
  if (
    !columns ||
    !footer ||
    columns.nextElementSibling !== footer ||
    !wrapper?.contains(columns) ||
    !header ||
    !columns.contains(document.querySelector("#entry_list"))
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
  };
}

export function createHostView(window, host) {
  const { document } = window;
  const style = document.createElement("style");
  style.dataset.userTopicsStyle = "";
  style.textContent = css;
  let root = null,
    focus = null,
    previousScroll = null,
    previousFocus = null,
    previousMarker = null,
    markerOwned = false;
  const markerObserver = new window.MutationObserver(() => {
    markerOwned = false;
  });
  function show() {
    if (root) return root;
    previousScroll = window.scrollY;
    previousFocus = host.columns.contains(document.activeElement)
      ? document.activeElement
      : null;
    focus = host.nav.querySelector(":scope > li > a.focus");
    if (focus) focus.classList.remove("focus");
    previousMarker = host.wrapper.getAttribute("data-user-topics-active");
    host.wrapper.dataset.userTopicsActive = "on";
    markerOwned = true;
    markerObserver.observe(host.wrapper, {
      attributes: true,
      attributeFilter: ["data-user-topics-active"],
    });
    document.head.append(style);
    root = document.createElement("section");
    root.dataset.userTopicsView = "";
    host.footer.before(root);
    return root;
  }
  function hide() {
    if (!root) return;
    const active = document.activeElement;
    const releaseFocus =
      active === document.body ||
      root.contains(active) ||
      active === host.nav.querySelector("[data-user-topics-link] a");
    root.remove();
    root = null;
    if (markerObserver.takeRecords().length) markerOwned = false;
    markerObserver.disconnect();
    style.remove();
    if (
      focus &&
      focus.isConnected &&
      !host.nav.querySelector(":scope > li > a.focus")
    )
      focus.classList.add("focus");
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
  return { show, hide };
}
