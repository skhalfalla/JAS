// The UI library: Preact + hooks + htm (tagged templates, so there's no build step). htm escapes all text.
import { h, render, Fragment, createContext, createRef } from '../vendor/preact.mjs';
import {
  useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useContext, useId,
} from '../vendor/hooks.mjs';
import htm from '../vendor/htm.mjs';

export const html = htm.bind(h);
export {
  h, render, Fragment, createContext, createRef,
  useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useContext, useId,
};
