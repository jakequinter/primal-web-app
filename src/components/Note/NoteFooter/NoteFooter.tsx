import { batch, Component, createEffect, Show } from 'solid-js';
import { MenuItem, PrimalNote } from '../../../types/primal';
import { sendRepost } from '../../../lib/notes';

import styles from './NoteFooter.module.scss';
import { useAccountContext } from '../../../contexts/AccountContext';
import { useToastContext } from '../../Toaster/Toaster';
import { useIntl } from '@cookbook/solid-intl';

import { truncateNumber } from '../../../lib/notifications';
import { canUserReceiveZaps, zapNote } from '../../../lib/zap';
import { useSettingsContext } from '../../../contexts/SettingsContext';

import zapMD from '../../../assets/lottie/zap_md.json';
import { toast as t } from '../../../translations';
import PrimalMenu from '../../PrimalMenu/PrimalMenu';
import { hookForDev } from '../../../lib/devTools';
import { getScreenCordinates } from '../../../utils';
import ZapAnimation from '../../ZapAnimation/ZapAnimation';
import { CustomZapInfo, useAppContext } from '../../../contexts/AppContext';
import NoteFooterActionButton from './NoteFooterActionButton';
import { NoteFooterState } from '../Note';
import { SetStoreFunction } from 'solid-js/store';
import BookmarkNote from '../../BookmarkNote/BookmarkNote';

const NoteFooter: Component<{
  note: PrimalNote,
  wide?: boolean,
  id?: string,
  state: NoteFooterState,
  updateState: SetStoreFunction<NoteFooterState>,
  customZapInfo: CustomZapInfo,
}> = (props) => {

  const account = useAccountContext();
  const toast = useToastContext();
  const intl = useIntl();
  const settings = useSettingsContext();
  const app = useAppContext();

  let medZapAnimation: HTMLElement | undefined;

  let quickZapDelay = 0;
  let footerDiv: HTMLDivElement | undefined;
  let repostMenu: HTMLDivElement | undefined;

  const repostMenuItems: MenuItem[] = [
    {
      action: () => doRepost(),
      label: 'Repost Note',
      icon: 'feed_repost',
    },
    {
      action: () => doQuote(),
      label: 'Quote Note',
      icon: 'quote',
    },
  ];

  const onClickOutside = (e: MouseEvent) => {
    if (
      !document?.getElementById(`repost_menu_${props.note.post.id}`)?.contains(e.target as Node)
    ) {
      props.updateState('isRepostMenuVisible', () => false);
    }
  }

  createEffect(() => {
    if (props.state.isRepostMenuVisible) {
      document.addEventListener('click', onClickOutside);
    }
    else {
      document.removeEventListener('click', onClickOutside);
    }
  });

  const showRepostMenu = (e: MouseEvent) => {
    e.preventDefault();
    props.updateState('isRepostMenuVisible', () => true);
  };

  const doQuote = () => {
    if (!account?.hasPublicKey()) {
      account?.actions.showGetStarted();
      return;
    }
    props.updateState('isRepostMenuVisible', () => false);
    account?.actions?.quoteNote(`nostr:${props.note.post.noteId}`);
    account?.actions?.showNewNoteForm();
  };

  const doRepost = async () => {
    if (!account) {
      return;
    }

    if (!account.hasPublicKey()) {
      account.actions.showGetStarted();
      return;
    }

    if (account.relays.length === 0) {
      toast?.sendWarning(
        intl.formatMessage(t.noRelaysConnected),
      );
      return;
    }

    props.updateState('isRepostMenuVisible', () => false);

    const { success } = await sendRepost(props.note, account.relays, account.relaySettings);

    if (success) {
      batch(() => {
        props.updateState('reposts', (r) => r + 1);
        props.updateState('reposted', () => true);
      });

      toast?.sendSuccess(
        intl.formatMessage(t.repostSuccess),
      );
    }
    else {
      toast?.sendWarning(
        intl.formatMessage(t.repostFailed),
      );
    }
  };

  const doReply = () => {};

  const doLike = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!account) {
      return;
    }

    if (!account.hasPublicKey()) {
      account.actions.showGetStarted();
      return;
    }

    if (account.relays.length === 0) {
      toast?.sendWarning(
        intl.formatMessage(t.noRelaysConnected),
      );
      return;
    }

    const success = await account.actions.addLike(props.note);

    if (success) {
      batch(() => {
        props.updateState('likes', (l) => l + 1);
        props.updateState('liked', () => true);
      });
    }
  };

  const startZap = (e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!account?.hasPublicKey()) {
      account?.actions.showGetStarted();
      props.updateState('isZapping', () => false);
      return;
    }

    if (account.relays.length === 0) {
      toast?.sendWarning(
        intl.formatMessage(t.noRelaysConnected),
      );
      return;
    }

    if (!canUserReceiveZaps(props.note.user)) {
      toast?.sendWarning(
        intl.formatMessage(t.zapUnavailable),
      );
      props.updateState('isZapping', () => false);
      return;
    }

    quickZapDelay = setTimeout(() => {
      app?.actions.openCustomZapModal(props.customZapInfo);
      props.updateState('isZapping', () => true);
    }, 500);
  };

  const commitZap = (e: MouseEvent | TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();

    clearTimeout(quickZapDelay);

    if (!account?.hasPublicKey()) {
      account?.actions.showGetStarted();
      return;
    }

    if (account.relays.length === 0 || !canUserReceiveZaps(props.note.user)) {
      return;
    }

    if (app?.customZap === undefined) {
      doQuickZap();
    }
  };

  const animateZap = () => {
    setTimeout(() => {
      props.updateState('hideZapIcon', () => true);

      if (!medZapAnimation) {
        return;
      }

      const newLeft = props.wide ? 36 : 24;
      const newTop = props.wide ? -28 : -28;

      medZapAnimation.style.left = `${newLeft}px`;
      medZapAnimation.style.top = `${newTop}px`;

      const onAnimDone = () => {
        batch(() => {
          props.updateState('showZapAnim', () => false);
          props.updateState('hideZapIcon', () => false);
        });
        medZapAnimation?.removeEventListener('complete', onAnimDone);
      }

      medZapAnimation.addEventListener('complete', onAnimDone);

      try {
        // @ts-ignore
        medZapAnimation.seek(0);
        // @ts-ignore
        medZapAnimation.play();
      } catch (e) {
        console.warn('Failed to animte zap:', e);
        onAnimDone();
      }
    }, 10);
  };

  const doQuickZap = async () => {
    if (!account?.hasPublicKey()) {
      account?.actions.showGetStarted();
      return;
    }

    batch(() => {
      props.updateState('zappedAmount', () => settings?.defaultZap.amount || 0);
      props.updateState('zappedNow', () => true);
      props.updateState('showZapAnim', () => true);
    });
    const success = await zapNote(props.note, account.publicKey, settings?.defaultZap.amount || 10, settings?.defaultZap.message || '', account.relays);

    props.updateState('isZapping', () => false);

    if (success) {
      return;
    }

    batch(() => {
      props.updateState('zappedAmount', () => -(settings?.defaultZap.amount || 0));
      props.updateState('zappedNow', () => true);
      props.updateState('zapped', () => props.note.post.noteActions.zapped);
    });
  }

  const buttonTypeClasses: Record<string, string> = {
    zap: styles.zapType,
    like: styles.likeType,
    reply: styles.replyType,
    repost: styles.repostType,
  };

  createEffect(() => {
    if (props.state.zappedNow) {
      batch(() => {
        props.updateState('zapCount', (z) => z + 1);
        props.updateState('satsZapped', (z) => z + props.state.zappedAmount);
        props.updateState('zapped', () => true);
      });
      props.updateState('zappedNow', () => false);
    }
  });

  createEffect(() => {
    if (props.state.showZapAnim) {
      animateZap();
    }
  });

  const determineOrient = () => {
    const coor = getScreenCordinates(repostMenu);
    const height = 100;
    return (coor.y || 0) + height < window.innerHeight + window.scrollY ? 'down' : 'up';
  }

  return (
    <div id={props.id} class={`${styles.footer} ${props.wide ? styles.wide : ''}`} ref={footerDiv} onClick={(e) => {e.preventDefault();}}>

      <Show when={props.state.showZapAnim}>
        <ZapAnimation
          id={`note-med-zap-${props.note.post.id}`}
          src={zapMD}
          class={styles.mediumZapLottie}
          ref={medZapAnimation}
        />
      </Show>

      <NoteFooterActionButton
        note={props.note}
        onClick={doReply}
        type="reply"
        highlighted={props.state.replied}
        label={props.state.replies === 0 ? '' : truncateNumber(props.state.replies, 2)}
        title={props.state.replies.toLocaleString()}
      />

      <NoteFooterActionButton
        note={props.note}
        onClick={(e: MouseEvent) => e.preventDefault()}
        onMouseDown={startZap}
        onMouseUp={commitZap}
        onTouchStart={startZap}
        onTouchEnd={commitZap}
        type="zap"
        highlighted={props.state.zapped || props.state.isZapping}
        label={props.state.satsZapped === 0 ? '' : truncateNumber(props.state.satsZapped, 2)}
        hidden={props.state.hideZapIcon}
        title={props.state.satsZapped.toLocaleString()}
      />

      <NoteFooterActionButton
        note={props.note}
        onClick={doLike}
        type="like"
        highlighted={props.state.liked}
        label={props.state.likes === 0 ? '' : truncateNumber(props.state.likes, 2)}
        title={props.state.likes.toLocaleString()}
      />

      <button
        id={`btn_repost_${props.note.post.id}`}
        class={`${styles.stat} ${props.state.reposted ? styles.highlighted : ''}`}
        onClick={showRepostMenu}
        title={props.state.reposts.toLocaleString()}
      >
        <div
          class={`${buttonTypeClasses.repost}`}
          ref={repostMenu}
        >
          <div
            class={styles.icon}
            style={'visibility: visible'}
          ></div>
          <div class={styles.statNumber}>
            {props.state.reposts === 0 ? '' : truncateNumber(props.state.reposts, 2)}
          </div>
          <PrimalMenu
            id={`repost_menu_${props.note.post.id}`}
            items={repostMenuItems}
            position="note_footer"
            orientation={determineOrient()}
            hidden={!props.state.isRepostMenuVisible}
          />
        </div>
      </button>

      <BookmarkNote note={props.note} />

    </div>
  )
}

export default hookForDev(NoteFooter);
