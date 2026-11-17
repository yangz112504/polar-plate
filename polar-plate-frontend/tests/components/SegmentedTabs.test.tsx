import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SegmentedTabs from "@/components/SegmentedTabs";

afterEach(cleanup);

/** Renders the hall tabs with Thorne selected. */
function renderHalls(onChange = vi.fn(), value = "Thorne") {
  render(<SegmentedTabs label="Dining hall" options={["Thorne", "Moulton"]} value={value} onChange={onChange} />);
  const group = screen.getByRole("tablist", { name: "Dining hall" });
  return { onChange, group, tabs: within(group).getAllByRole("tab") };
}

describe("SegmentedTabs", () => {
  it("shows one tab per option, in the order given", () => {
    const { tabs } = renderHalls();
    expect(tabs.map((t) => t.textContent)).toEqual(["Thorne", "Moulton"]);
  });

  it("shows only the options it is given (weekend meals have no Breakfast or Lunch)", () => {
    render(<SegmentedTabs label="Meal" options={["Brunch", "Dinner"]} value="Brunch" onChange={vi.fn()} />);
    const names = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(names).toEqual(["Brunch", "Dinner"]);
  });

  it("marks only the selected option as selected", () => {
    const { tabs } = renderHalls(vi.fn(), "Moulton");
    expect(tabs[0]).toHaveAttribute("aria-selected", "false");
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
  });

  it("calls onChange with the clicked option", async () => {
    const { onChange, tabs } = renderHalls();
    await userEvent.click(tabs[1]);
    expect(onChange).toHaveBeenCalledWith("Moulton");
  });

  it("is a single Tab stop: only the selected tab is tabbable", () => {
    const { tabs } = renderHalls();
    expect(tabs[0]).toHaveAttribute("tabindex", "0");
    expect(tabs[1]).toHaveAttribute("tabindex", "-1");
  });

  it("ArrowRight selects the next option", async () => {
    const { onChange, tabs } = renderHalls();
    tabs[0].focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("Moulton");
  });

  it("ArrowRight on the last option wraps to the first", async () => {
    const { onChange, tabs } = renderHalls(vi.fn(), "Moulton");
    tabs[1].focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("Thorne");
  });

  it("ArrowLeft on the first option wraps to the last", async () => {
    const { onChange, tabs } = renderHalls();
    tabs[0].focus();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenCalledWith("Moulton");
  });

  it("Home selects the first option and End the last", async () => {
    const { onChange, tabs } = renderHalls(vi.fn(), "Moulton");
    tabs[1].focus();
    await userEvent.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("Thorne");
    await userEvent.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith("Moulton");
  });

  it("renders an empty tablist without crashing when there are no options", () => {
    render(<SegmentedTabs label="Meal" options={[]} value="" onChange={vi.fn()} />);
    expect(screen.getByRole("tablist", { name: "Meal" })).toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });
});
