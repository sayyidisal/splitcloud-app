export const actionTypes = {
  CHANGE_PLAYBACK_MODE: 'CHANGE_PLAYBACK_MODE',
  TOGGLE_PLAYER_MUTE: 'TOGGLE_PLAYER_MUTE',
  TOGGLE_PLAYER_PAN: 'TOGGLE_PLAYER_PAN',
  UPDATE_PICKER_SEARCH_TERMS: 'UPDATE_PICKER_SEARCH_TERMS',
  SET_PICKER_LOADING_STATE:'SET_PICKER_LOADING_STATE',
  GET_PLAYLIST : 'GET_PLAYLIST',
  SET_PLAYLIST : 'SET_PLAYLIST',
  CLEAR_PLAYLIST: 'CLEAR_PLAYLIST',
  ADD_PLAYLIST_ITEM : 'ADD_PLAYLIST_ITEM',
  REMOVE_PLAYLIST_ITEM : 'REMOVE_PLAYLIST_ITEM',
  PLAY_PLAYLIST_ITEM : 'PLAY_PLAYLIST_ITEM',
  INCREMENT_CURR_PLAY_INDEX:'INCREMENT_CURR_PLAY_INDEX',
  DECREMENT_CURR_PLAY_INDEX:'DECREMENT_CURR_PLAY_INDEX',
  CHANGE_CURR_PLAY_INDEX :'CHANGE_CURR_PLAY_INDEX',
  CLEAR_NOTIFICATION :'CLEAR_NOTIFICATION',
  ADD_NOTIFICATION : 'ADD_NOTIFICATION',
  SET_GLOBAL_SETTING : 'SET_GLOBAL_SETTING',
  INVERT_PLAYER_SIDE : 'INVERT_PLAYER_SIDE' 
}
//TODO: move out on his own appConstant file
export const playbackModeTypes = {
  SPLIT : 'S',
  LEFT : 'L',
  RIGHT : 'R'
}
