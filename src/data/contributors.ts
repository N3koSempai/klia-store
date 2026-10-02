/**
 * People who contributed to Klia Store, shown in the About dialog.
 *
 * Add one entry per contributor. `topicKey` must point to an existing
 * `about.contributorTopics.*` translation key (add the key to every locale).
 */
export interface Contributor {
	/** Display name in the list; also the handle of the profile URL. */
	user: string;
	/** Profile opened when the name is clicked. */
	url: string;
	/** i18n key describing what this person worked on. */
	topicKey: string;
}

export const CONTRIBUTORS: Contributor[] = [
	{
		user: "chenshifanjian",
		url: "https://github.com/chenshifanjian",
		topicKey: "about.contributorTopics.localization",
	},
];
